# -*- coding: utf-8 -*-
"""
rag_ab_test.py - RAG 有/无检索 A/B 对照实验
对照评审标准"生成质量是否因检索而显著提升"：
- 同一提示词模板，唯一变量 = 是否注入检索上下文（诗人小传 + 向量 top5 相似诗篇）
- 检索组件与生产一致：embed_server(8100) + MySQL chunks 向量 + 余弦 topK
- GLM-4-Flash 盲评乱序打分（1-10）：典故可信 / 意象关联 / 信息丰富 / 整体质量
- 输出 docs/rag_ab_report.md
"""
import json
import os
import random
import re
import time

import numpy as np
import pymysql
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMBED_URL = "http://127.0.0.1:8100"
LLM_MODEL = "glm-4-flash"
N_SAMPLES = 5
SEED = 42

cfg = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            cfg[k.strip()] = v

ZHIPU_URL = cfg.get("ZHIPUAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4").rstrip("/") + "/chat/completions"
ZHIPU_HEADERS = {"Authorization": f"Bearer {cfg['ZHIPUAI_API_KEY']}", "Content-Type": "application/json"}

SYSTEM = "你是古典文学研究专家，严格使用【小节名】标记分节输出，不输出任何额外内容。"


def chat(prompt, retries=3):
    payload = {
        "model": LLM_MODEL,
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
        "temperature": 0.6,
        "max_tokens": 1200,
    }
    for i in range(retries):
        try:
            r = requests.post(ZHIPU_URL, headers=ZHIPU_HEADERS, json=payload, timeout=120)
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"]
            print(f"  [WARN] HTTP {r.status_code}: {r.text[:120]}")
        except Exception as e:
            print(f"  [WARN] {type(e).__name__}: {e}")
        time.sleep(3 * (i + 1))
    return ""


def embed(text):
    r = requests.post(f"{EMBED_URL}/embed", json={"texts": [text]}, timeout=30)
    return r.json()["vectors"][0]


def load_corpus(conn):
    """流式加载全部 poem 向量（省内存：预分配矩阵 + 逐行填充 + 分块原地归一化）"""
    from pymysql.cursors import SSCursor
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM chunks WHERE chunk_type='poem' AND embedding IS NOT NULL")
        n = cur.fetchone()[0]
    mat = np.empty((n, 512), dtype=np.float32)
    ids = []
    filled = 0
    with conn.cursor(SSCursor) as cur:
        cur.execute("SELECT ref_id, embedding FROM chunks WHERE chunk_type='poem' AND embedding IS NOT NULL")
        for ref_id, emb in cur:
            try:
                v = json.loads(emb)
                if len(v) == 512:
                    mat[filled] = v
                    ids.append(ref_id)
                    filled += 1
            except Exception:
                pass
    mat = mat[:filled]  # 视图切片，不复制
    # 分块原地归一化，避免大临时数组
    chunk = 8192
    for i in range(0, filled, chunk):
        seg = mat[i:i + chunk]
        seg /= np.linalg.norm(seg, axis=1, keepdims=True).clip(min=1e-12)
    print(f"[corpus] 载入 {filled} 条向量 (512d)")
    return ids, mat


def topk(ids, mat, qv, exclude, k=5):
    q = np.array(qv, dtype=np.float32)
    q /= (np.linalg.norm(q) or 1)
    scores = mat @ q
    order = np.argsort(-scores)
    out = []
    for i in order:
        pid = ids[int(i)]
        if pid == exclude:
            continue
        out.append((pid, round(float(scores[int(i)]), 3)))
        if len(out) >= k:
            break
    return out


def build_prompt(title, dynasty, author, body, bio_ctx, related_ctx):
    ctx = ""
    if bio_ctx:
        ctx += f"诗人小传：{bio_ctx}\n"
    if related_ctx:
        ctx += f"语义相似诗篇（向量检索）：\n{related_ctx}\n"
    ctx_block = f"\n【参考上下文（知识库检索结果）】\n{ctx}\n" if ctx else "\n"
    return f"""你是一位资深古典文学研究专家。请对下面这首诗进行四维度学术注解。

【诗词】《{title}》〔{dynasty}〕{author}
{body}
{ctx_block}
请严格按以下格式输出，不要输出任何额外文字、不要 markdown 代码块、不要重复诗词原文：
【字词释义】
（解析诗中2-4个关键字词的含义与用法，150字以内）
【典故溯源】
（解析诗中典故或核心意象的历史文化源流，150字以内）
【情感分析】
（分析诗歌的情感路径与意境层次，150字以内）
【格律分析】
（判断体裁、平仄特点、押韵与对仗情况，120字以内）"""


def judge(poem_line, ans_a, ans_b):
    prompt = f"""你是古典诗词注解质量的评审专家。下面是同一首诗的两份匿名注解，请从四个维度分别打分（1-10 整数）：
- dianjia：典故与字词解释的可信度与准确性
- yixiang：对意象与诗歌主题的关联解读
- fengfu：信息丰富度（是否给出诗篇互证、背景依据）
- zhengti：整体学术质量

只输出 JSON，格式：{{"A":{{"dianjia":0,"yixiang":0,"fengfu":0,"zhengti":0}},"B":{{"dianjia":0,"yixiang":0,"fengfu":0,"zhengti":0}},"reason":"50字内理由"}}

【诗词】{poem_line}

【注解一】
{ans_a}

【注解二】
{ans_b}"""
    raw = chat(prompt)
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        return None, None, ""
    try:
        d = json.loads(m.group(0))
        return d.get("A"), d.get("B"), d.get("reason", "")
    except Exception:
        return None, None, ""


def main():
    t0 = time.time()
    conn = pymysql.connect(
        host=cfg["MYSQL_HOST"], port=int(cfg["MYSQL_PORT"]), user=cfg["MYSQL_USER"],
        password=cfg["MYSQL_PASSWORD"], database=cfg["MYSQL_DATABASE"], charset="utf8mb4",
    )
    ids, mat = load_corpus(conn)
    idset = set(ids)

    # 选样：两组对照（固定种子可复现）
    # 随机组：任意有小传的诗；冷门组：小传 <100 字的长尾诗人（模型知识薄弱区）
    rng = random.Random(SEED)

    def fetch_poems(where, order_rand_seed, n):
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT p.id, p.title, p.author, p.dynasty, p.bio_len, COALESCE(p.paragraphs_simp, p.paragraphs)
                    FROM (
                        SELECT p.*, CHAR_LENGTH(COALESCE(b.bio_simp, b.bio_desc)) AS bio_len
                        FROM poems p JOIN poet_bios b ON b.name = p.author
                    ) p
                    {where}
                    ORDER BY RAND({order_rand_seed}) LIMIT {n * 60}""",
            )
            rows = cur.fetchall()
        picked, seen = [], set()
        for pid, title, author, dynasty, bio_len, paras in rows:
            key = (title, author)
            if key in seen:
                continue
            body = "".join(json.loads(paras) if paras else [])
            if not (24 <= len(body) <= 160):
                continue
            seen.add(key)
            picked.append({"id": pid, "title": title, "author": author,
                           "dynasty": dynasty, "body": body, "bio_len": bio_len})
            if len(picked) >= n:
                break
        return picked

    group_random = fetch_poems("WHERE p.bio_len > 0", SEED, N_SAMPLES)
    group_cold = fetch_poems("WHERE p.bio_len > 0 AND p.bio_len < 100", SEED + 1, N_SAMPLES)
    print(f"[sample] 随机组 {len(group_random)} 首 + 冷门组 {len(group_cold)} 首")

    results = []
    for gi, (group_name, poems) in enumerate([("random", group_random), ("cold", group_cold)]):
        for idx, p in enumerate(poems):
            print(f"\n=== [{group_name}] 样本 {idx + 1} 《{p['title']}》{p['author']} (bio {p['bio_len']}字) ===")
            qtext = f"《{p['title']}》{p['author']}：{p['body']}"[:400]
            hits = topk(ids, mat, embed(qtext), p["id"])
            score_map = dict(hits)
            related_meta = []
            with conn.cursor() as cur:
                fmt = ",".join(["%s"] * len(hits))
                cur.execute(
                    f"SELECT id, title, author, dynasty, COALESCE(paragraphs_simp, paragraphs) FROM poems WHERE id IN ({fmt})",
                    [h[0] for h in hits],
                )
                for pid, t, a, d, paras in cur.fetchall():
                    related_meta.append({
                        "id": pid, "title": t, "author": a, "dynasty": d,
                        "body": "".join(json.loads(paras) if paras else []), "score": score_map[pid],
                    })
            with conn.cursor() as cur:
                cur.execute("SELECT bio_simp FROM poet_bios WHERE name=%s LIMIT 1", (p["author"],))
                row = cur.fetchone()
            bio_ctx = (row[0] or "")[:260] if row and row[0] else ""

            related_ctx = "\n".join(f"《{m['title']}》〔{m['dynasty']}〕{m['author']}：{m['body']}" for m in related_meta)
            top_str = "；".join(f"《{m['title']}》{m['score']}" for m in related_meta)
            print(f"  检索 top5: {top_str}")

            prompt_rag = build_prompt(p["title"], p["dynasty"], p["author"], p["body"], bio_ctx, related_ctx)
            prompt_base = build_prompt(p["title"], p["dynasty"], p["author"], p["body"], "", "")
            print("  生成中（有检索 / 无检索）…")
            ans_rag = chat(prompt_rag)
            ans_base = chat(prompt_base)

            # 盲评乱序（gi/idx 组合保证各组乱序独立）
            rng = random.Random(SEED + gi * 100 + idx)
            rag_first = rng.random() < 0.5
            ans_a, ans_b = (ans_rag, ans_base) if rag_first else (ans_base, ans_rag)
            sa, sb, reason = judge(f"《{p['title']}》〔{p['dynasty']}〕{p['author']}：{p['body']}", ans_a, ans_b)
            s_rag = sa if rag_first else sb
            s_base = sb if rag_first else sa
            # 典故 grounding：有检索回答中引用的诗篇是否真实出现在检索结果
            cited = set(re.findall(r"《([^》]{1,30})》", ans_rag))
            retrieved = {m["title"] for m in related_meta}
            grounded = sorted(cited & retrieved)

            results.append({"poem": p, "related": related_meta, "bio": bool(bio_ctx), "group": group_name,
                            "rag": ans_rag, "base": ans_base, "s_rag": s_rag, "s_base": s_base,
                            "reason": reason, "grounded": grounded})
            sr = s_rag or {}
            sb2 = s_base or {}
            print(f"  有检索 zhengti={sr.get('zhengti')} vs 无检索 zhengti={sb2.get('zhengti')} | grounding 引用={grounded}")

    # 汇总
    dims = ["dianjia", "yixiang", "fengfu", "zhengti"]
    dim_names = {"dianjia": "典故可信", "yixiang": "意象关联", "fengfu": "信息丰富", "zhengti": "整体质量"}

    def avg(rs, arm):
        out = {}
        for d in dims:
            seq = [(r[arm] or {}).get(d) for r in rs if (r[arm] or {}).get(d) is not None]
            out[d] = round(sum(seq) / len(seq), 2) if seq else 0
        return out

    def wtl(rs):
        w = sum(1 for r in rs if (r["s_rag"] or {}).get("zhengti", 0) > (r["s_base"] or {}).get("zhengti", 0))
        t = sum(1 for r in rs if (r["s_rag"] or {}).get("zhengti", 0) == (r["s_base"] or {}).get("zhengti", 0))
        return w, t, len(rs) - w - t

    print("\n========== 汇总（GLM-4-Flash 盲评，1-10） ==========")
    for name, label in [("random", "随机组"), ("cold", "冷门诗人组"), ("all", "全部")]:
        rs = results if name == "all" else [r for r in results if r["group"] == name]
        if not rs:
            continue
        a_rag, a_base = avg(rs, "s_rag"), avg(rs, "s_base")
        w, t, l = wtl(rs)
        print(f"\n--- {label}（{len(rs)} 首）---")
        print(f"{'维度':<10}{'有检索 RAG':>12}{'无检索':>10}{'提升':>8}")
        for d in dims:
            print(f"{dim_names[d]:<10}{a_rag[d]:>12}{a_base[d]:>10}{round(a_rag[d] - a_base[d], 2):>8}")
        print(f"整体质量胜负：RAG 胜 {w} / 平 {t} / 负 {l}")

    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    with open(os.path.join(ROOT, "docs", "rag_ab_report.md"), "w", encoding="utf-8") as f:
        f.write(f"""# RAG 有/无检索 A/B 对照实验报告

> 实验日期：{time.strftime('%Y-%m-%d')} · 检索模型：BAAI/bge-small-zh-v1.5（512 维余弦 topK，语料 {len(ids)} 篇）· 生成模型：{LLM_MODEL}（temperature 0.6）
> 方法：同一提示词模板，唯一变量为是否注入检索上下文（诗人小传 + 向量 top5 相似诗篇）；两个回答匿名乱序后由 {LLM_MODEL} 盲评打分（1-10），评分维度：典故可信 / 意象关联 / 信息丰富 / 整体质量。
> 分组：**随机组**（任意有小传的诗）考察普遍效果；**冷门诗人组**（小传 <100 字的长尾诗人）考察模型知识薄弱区检索的增益。

## 一、盲评得分汇总
""")
        for name, label in [("random", "随机组"), ("cold", "冷门诗人组"), ("all", "全部样本")]:
            rs = results if name == "all" else [r for r in results if r["group"] == name]
            if not rs:
                continue
            a_rag, a_base = avg(rs, "s_rag"), avg(rs, "s_base")
            w, t, l = wtl(rs)
            f.write(f"\n### {label}（{len(rs)} 首）\n\n| 维度 | 有检索 RAG | 无检索 | 提升 |\n| --- | --- | --- | --- |\n")
            for d in dims:
                f.write(f"| {dim_names[d]} | {a_rag[d]} | {a_base[d]} | +{round(a_rag[d] - a_base[d], 2)} |\n")
            f.write(f"\n整体质量胜负：**RAG 胜 {w} / 平 {t} / 负 {l}**\n")

        f.write("""
## 二、检索命中示例（grounding）

| 样本 | 分组 | 向量检索 top1 | 相似度 | RAG 回答中真实引用的检索诗篇 |
| --- | --- | --- | --- | --- |
""")
        for r in results:
            top1 = r["related"][0] if r["related"] else None
            t1 = f"《{top1['title']}》" if top1 else "—"
            s1 = str(top1["score"]) if top1 else "—"
            g = "、".join(f"《{t}》" for t in r["grounded"]) or "—"
            f.write(f"| 《{r['poem']['title']}》{r['poem']['author']} | {r['group']} | {t1} | {s1} | {g} |\n")

        f.write("\n## 三、逐样本盲评明细\n")
        for i, r in enumerate(results):
            sr, sb = r["s_rag"] or {}, r["s_base"] or {}
            f.write(f"\n### 样本 {i + 1} [{r['group']}] 《{r['poem']['title']}》〔{r['poem']['dynasty']}〕{r['poem']['author']}\n\n")
            f.write(f"诗原文：{r['poem']['body']}\n\n")
            f.write("| 维度 | 有检索 | 无检索 |\n| --- | --- | --- |\n")
            for d in dims:
                f.write(f"| {dim_names[d]} | {sr.get(d, '—')} | {sb.get(d, '—')} |\n")
            f.write(f"\n评审理由：{r['reason']}\n\n")
            f.write(f"**有检索回答：**\n\n{r['rag']}\n\n**无检索回答：**\n\n{r['base']}\n")
    conn.close()
    print(f"\n[OK] 报告已写入 docs/rag_ab_report.md，总耗时 {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
