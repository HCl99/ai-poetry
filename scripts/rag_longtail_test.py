# -*- coding: utf-8 -*-
"""
rag_longtail_test.py - RAG 长尾知识问答分段评测（rag_ab_test.py 的补充实验）

动机：注解 A/B（rag_ab_test.py）中随机组 RAG 已小幅领先，但冷门诗人组因检索结果
多为同诗人组诗而未能体现检索价值。检索的真实价值区间是长尾知识问答：
对模型知识薄弱的冷门诗人，BASE 只能凭印象杜撰，RAG 可拿出库内真实作品。

设计：
- 样本：小传 <100 字且库内存诗 4~300 首的冷门诗人 N 位（默认 20，LT_N 可覆盖）
- 任务：请介绍该诗人并举出其至少三首诗作标题 + 其中一首原文
- RAG 组注入：诗人小传 + 库内该诗人真实诗篇 top5（结构化检索）
- 客观指标（不依赖盲评）：
  1. 篇名归属：所引《诗题》按 (title, author) 对核验——正确归属 / 张冠李戴 / 杜撰篇名
  2. 诗句可验证率：回答中的诗句片段是否真实存在于该诗人库内作品
- 主观指标：GLM 盲评四维打分（与 rag_ab_test.py 同口径）
- 输出 docs/rag_longtail_report.md
"""
import json
import os
import random
import re
import time

import pymysql
import requests

from rag_ab_test import CANON  # 复用典籍白名单，判定口径一致

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LLM_MODEL = "glm-4-flash"
N_SAMPLES = int(os.environ.get("LT_N", "20"))
SEED = 7

cfg = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            cfg[k.strip()] = v

ZHIPU_URL = cfg.get("ZHIPUAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4").rstrip("/") + "/chat/completions"
ZHIPU_HEADERS = {"Authorization": f"Bearer {cfg['ZHIPUAI_API_KEY']}", "Content-Type": "application/json"}


def chat(prompt, retries=3):
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": "你是古典文学研究专家，回答准确、严谨，不输出任何额外内容。"},
            {"role": "user", "content": prompt},
        ],
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


def fetch_cold_poets(conn, n):
    """冷门诗人：有小传但 <100 字（模型知识薄弱区），库内存诗 4~300 首"""
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT b.name,
                       CHAR_LENGTH(COALESCE(b.bio_simp, b.bio_desc)) AS bio_len,
                       COUNT(p.id) AS poem_cnt
                FROM poet_bios b JOIN poems p ON p.author = b.name
                GROUP BY b.name, bio_len
                HAVING bio_len > 0 AND bio_len < 100 AND poem_cnt >= 4 AND poem_cnt <= 300
                ORDER BY RAND({SEED}) LIMIT {n}"""
        )
        return [{"author": r[0], "bio_len": r[1], "poem_cnt": r[2]} for r in cur.fetchall()]


def poet_data(conn, author, limit=5):
    """该诗人的小传 + 库内真实诗篇（结构化检索，即知识库 grounding）"""
    with conn.cursor() as cur:
        cur.execute("SELECT COALESCE(bio_simp, bio_desc) FROM poet_bios WHERE name=%s LIMIT 1", (author,))
        row = cur.fetchone()
        bio = (row[0] or "")[:300] if row else ""
        cur.execute(
            f"""SELECT title, dynasty, COALESCE(paragraphs_simp, paragraphs)
                FROM poems WHERE author=%s ORDER BY RAND({SEED}) LIMIT {limit}""",
            (author,),
        )
        poems = [
            {"title": t, "dynasty": d, "body": "".join(json.loads(paras) if paras else [])}
            for t, d, paras in cur.fetchall()
        ]
    return bio, poems


def build_prompt(author, bio, poems):
    if poems is not None:
        ctx = f"诗人小传：{bio}\n\n库内该诗人作品（知识库检索结果）：\n"
        ctx += "\n".join(f"《{p['title']}》〔{p['dynasty']}〕\n{p['body']}" for p in poems)
        rule = """
【引用要求】仅允许引用上述库内作品列表中出现的诗篇，严禁引用列表之外的诗篇，不得杜撰诗题；《书名号》内只填诗篇标题本身。"""
        ctx_block = f"\n【参考上下文（知识库检索结果）】\n{ctx}\n" + rule
    else:
        ctx_block = ""
    return f"""请介绍诗人 {author} 的生平与诗歌创作风格，并举出其至少三首诗作的标题，附上其中一首的完整原文。{ctx_block}"""


def is_canon(t):
    if t in CANON:
        return True
    head = re.split(r"[·:：]", t, maxsplit=1)[0].strip()
    return head in CANON


def verify_titles(answer, author, pair_set):
    """篇名归属核验：正确归属 / 张冠李戴（库内有此题但非该作者）/ 杜撰篇名 / 格式违规"""
    cited = set(re.findall(r"《([^》]{1,30})》", answer))
    ok, wrong, fake, fmt = [], [], [], []
    for t in sorted(cited):
        if is_canon(t):
            continue
        if re.search(r"[，。；、？！]", t) or len(t) > 12:
            fmt.append(t)
            continue
        tn = re.sub(r"\s+", "", t)
        owners = pair_set.get(tn)
        if owners is None:
            fake.append(t)
        elif author in owners:
            ok.append(t)
        else:
            wrong.append(t)
    return ok, wrong, fake, fmt


def verify_lines(answer, author_lines):
    """诗句可验证率：回答中的纯中文诗句片段（4~12 字）命中该诗人库内诗句的比例"""
    author_set = set(author_lines)
    segs = re.split(r"[，。！？；、\s《》（）【】\[\]：:0-9a-zA-Z—…·\"\"'']+", answer)
    cands = [s for s in (x.strip() for x in segs)
             if 4 <= len(s) <= 12 and re.fullmatch(r"[一-鿿]+", s)]
    if not cands:
        return 0, 0
    hit = sum(1 for s in cands if s in author_set)
    return hit, len(cands)


def judge(question, ans_a, ans_b):
    prompt = f"""你是古典诗词知识问答质量的评审专家。下面是同一问题的两份匿名回答，请从四个维度分别打分（1-10 整数）：
- dianjia：所述生平与作品信息的可信度与准确性
- yixiang：对诗人风格与意象的解读质量
- fengfu：信息丰富度（是否给出真实诗篇佐证）
- zhengti：整体学术质量

只输出 JSON，格式：{{"A":{{"dianjia":0,"yixiang":0,"fengfu":0,"zhengti":0}},"B":{{"dianjia":0,"yixiang":0,"fengfu":0,"zhengti":0}},"reason":"50字内理由"}}

【问题】{question}

【回答一】
{ans_a}

【回答二】
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

    # (去空白诗题 -> 作者集合) 全库映射：归属/张冠李戴/杜撰判定用
    with conn.cursor() as cur:
        cur.execute("SELECT title, author FROM poems")
        pair_set = {}
        for title, author in cur.fetchall():
            pair_set.setdefault(re.sub(r"\s+", "", title), set()).add(author)
    print(f"[corpus] 诗题-作者映射 {len(pair_set)} 条")

    poets = fetch_cold_poets(conn, N_SAMPLES)
    print(f"[sample] 冷门诗人 {len(poets)} 位：{[p['author'] for p in poets]}")

    results = []
    for idx, poet in enumerate(poets):
        author = poet["author"]
        print(f"\n=== [{idx + 1}/{len(poets)}] {author}（小传 {poet['bio_len']} 字，存诗 {poet['poem_cnt']} 首）===")
        bio, poems = poet_data(conn, author)

        # 该诗人全部库内诗句集合（诗句可验证率用，不局限于注入的 5 首）
        with conn.cursor() as cur:
            cur.execute("SELECT COALESCE(paragraphs_simp, paragraphs) FROM poems WHERE author=%s", (author,))
            author_lines = []
            for (paras,) in cur.fetchall():
                for para in (json.loads(paras) if paras else []):
                    author_lines.extend(s for s in re.split(r"[，。！？；、]", para) if s)

        prompt_rag = build_prompt(author, bio, poems)
        prompt_base = build_prompt(author, "", None)
        print("  生成中（有检索 / 无检索）…")
        ans_rag = chat(prompt_rag)
        ans_base = chat(prompt_base)

        rng = random.Random(SEED + idx)
        rag_first = rng.random() < 0.5
        ans_a, ans_b = (ans_rag, ans_base) if rag_first else (ans_base, ans_rag)
        sa, sb, reason = judge(f"请介绍诗人 {author} 并举出其诗作", ans_a, ans_b)

        v_rag = verify_titles(ans_rag, author, pair_set)
        v_base = verify_titles(ans_base, author, pair_set)
        l_rag = verify_lines(ans_rag, author_lines)
        l_base = verify_lines(ans_base, author_lines)
        print(f"  篇名 RAG : 归属{len(v_rag[0])} 张冠李戴{len(v_rag[1])} 杜撰{len(v_rag[2])} | BASE: 归属{len(v_base[0])} 张冠李戴{len(v_base[1])} 杜撰{len(v_base[2])}")
        print(f"  诗句命中 RAG: {l_rag[0]}/{l_rag[1]} | BASE: {l_base[0]}/{l_base[1]}")

        results.append({
            "poet": poet, "rag": ans_rag, "base": ans_base,
            "s_rag": sa if rag_first else sb, "s_base": sb if rag_first else sa,
            "reason": reason, "v_rag": v_rag, "v_base": v_base,
            "l_rag": l_rag, "l_base": l_base, "retrieved": [p["title"] for p in poems],
        })

    # ---- 汇总 ----
    dims = ["dianjia", "yixiang", "fengfu", "zhengti"]
    dim_names = {"dianjia": "生平可信", "yixiang": "风格解读", "fengfu": "信息丰富", "zhengti": "整体质量"}

    def avg(arm):
        out = {}
        for d in dims:
            seq = [(r[arm] or {}).get(d) for r in results if (r[arm] or {}).get(d) is not None]
            out[d] = round(sum(seq) / len(seq), 2) if seq else 0
        return out

    a_rag, a_base = avg("s_rag"), avg("s_base")
    w = sum(1 for r in results if (r["s_rag"] or {}).get("zhengti", 0) > (r["s_base"] or {}).get("zhengti", 0))
    t = sum(1 for r in results if (r["s_rag"] or {}).get("zhengti", 0) == (r["s_base"] or {}).get("zhengti", 0))

    def agg_verify(key):
        ok = sum(len(r[key][0]) for r in results)
        wrong = sum(len(r[key][1]) for r in results)
        fake = sum(len(r[key][2]) for r in results)
        fmt = sum(len(r[key][3]) for r in results)
        return ok, wrong, fake, fmt

    def agg_lines(key):
        hit = sum(r[key][0] for r in results)
        tot = sum(r[key][1] for r in results)
        return hit, tot

    ok_r, wr_r, fk_r, fm_r = agg_verify("v_rag")
    ok_b, wr_b, fk_b, fm_b = agg_verify("v_base")
    lh_r, lt_r = agg_lines("l_rag")
    lh_b, lt_b = agg_lines("l_base")
    tot_r, tot_b = ok_r + wr_r + fk_r, ok_b + wr_b + fk_b

    print("\n========== 汇总 ==========")
    print(f"盲评整体质量：RAG {a_rag['zhengti']} vs BASE {a_base['zhengti']}（胜 {w} / 平 {t} / 负 {len(results) - w - t}）")
    print(f"篇名归属 RAG : 正确 {ok_r} / 张冠李戴 {wr_r} / 杜撰 {fk_r}（杜撰率 {round(fk_r / tot_r * 100, 1) if tot_r else 0}%）")
    print(f"篇名归属 BASE: 正确 {ok_b} / 张冠李戴 {wr_b} / 杜撰 {fk_b}（杜撰率 {round(fk_b / tot_b * 100, 1) if tot_b else 0}%）")
    print(f"诗句可验证率 RAG : {lh_r}/{lt_r} = {round(lh_r / lt_r * 100, 1) if lt_r else 0}%")
    print(f"诗句可验证率 BASE: {lh_b}/{lt_b} = {round(lh_b / lt_b * 100, 1) if lt_b else 0}%")

    with open(os.path.join(ROOT, "docs", "rag_longtail_report.md"), "w", encoding="utf-8") as f:
        f.write(f"""# RAG 长尾知识问答分段评测报告

> 实验日期：{time.strftime('%Y-%m-%d')} · 任务：冷门诗人知识问答（介绍诗人 + 举出诗作标题与原文）· 样本：{len(results)} 位冷门诗人（小传 <100 字、库内存诗 4~300 首，模型知识薄弱区）· 生成模型：{LLM_MODEL}（temperature 0.6）
> 方法：RAG 组注入诗人小传 + 库内该诗人真实诗篇 top5（结构化检索）；BASE 组无上下文。篇名归属按 (去空白诗题, 作者) 对在全库 {len(pair_set)} 个诗题中核验；诗句可验证率 = 回答中纯中文诗句片段（4~12 字）命中该诗人库内诗句的比例。二者均为**客观指标**，不依赖盲评；盲评四维打分与 rag_ab_test.py 同口径作为主观对照。
> 定位：本实验是注解 A/B（docs/rag_ab_report.md）的**分段补充**——注解任务对检索天然不敏感（名篇无检索也答得好），长尾知识问答才是检索增强的真实价值区间。

## 一、客观指标（核心结论）

| 指标 | 有检索 RAG | 无检索 BASE |
| --- | --- | --- |
| 引用篇名总数 | {tot_r} | {tot_b} |
| 正确归属（真实存在且确为该诗人作品） | {ok_r}（{round(ok_r / tot_r * 100, 1) if tot_r else 0}%） | {ok_b}（{round(ok_b / tot_b * 100, 1) if tot_b else 0}%） |
| 张冠李戴（真实存在但非该诗人作品） | {wr_r} | {wr_b} |
| 杜撰篇名（全库不存在） | {fk_r} | {fk_b} |
| **杜撰率** | **{round(fk_r / tot_r * 100, 1) if tot_r else 0}%** | **{round(fk_b / tot_b * 100, 1) if tot_b else 0}%** |
| 诗句可验证率 | **{round(lh_r / lt_r * 100, 1) if lt_r else 0}%**（{lh_r}/{lt_r}） | **{round(lh_b / lt_b * 100, 1) if lt_b else 0}%**（{lh_b}/{lt_b}） |

## 二、盲评得分（主观对照）

| 维度 | 有检索 RAG | 无检索 | 提升 |
| --- | --- | --- | --- |
""")
        for d in dims:
            f.write(f"| {dim_names[d]} | {a_rag[d]} | {a_base[d]} | +{round(a_rag[d] - a_base[d], 2)} |\n")
        f.write(f"\n整体质量胜负：**RAG 胜 {w} / 平 {t} / 负 {len(results) - w - t}**\n")

        f.write("""
## 三、逐样本明细

| 诗人 | 小传字数 | 存诗 | 回答 | 正确归属 | 张冠李戴 | 杜撰篇名 | 诗句命中 | 盲评整体 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
""")
        for r in results:
            for arm, vk, lk, sk in [("RAG", "v_rag", "l_rag", "s_rag"), ("BASE", "v_base", "l_base", "s_base")]:
                v = r[vk]
                hit, tot = r[lk]
                f.write(
                    f"| {r['poet']['author']} | {r['poet']['bio_len']} | {r['poet']['poem_cnt']} | {arm} | "
                    f"{len(v[0])} | {len(v[1])} | {len(v[2])}（{'、'.join(v[2]) or '—'}） | {hit}/{tot} | {(r[sk] or {}).get('zhengti', '—')} |\n"
                )
        f.write("\n## 四、逐样本回答原文\n")
        for i, r in enumerate(results):
            f.write(f"\n### 样本 {i + 1}：{r['poet']['author']}（小传 {r['poet']['bio_len']} 字，存诗 {r['poet']['poem_cnt']} 首）\n\n")
            f.write(f"检索注入：{'、'.join('《' + t + '》' for t in r['retrieved'])}\n\n")
            f.write(f"**有检索回答：**\n\n{r['rag']}\n\n**无检索回答：**\n\n{r['base']}\n\n")
            f.write(f"评审理由：{r['reason']}\n")

    conn.close()
    print(f"\n[OK] 报告已写入 docs/rag_longtail_report.md，总耗时 {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
