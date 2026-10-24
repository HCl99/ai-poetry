# -*- coding: utf-8 -*-
"""
rag_ab_test.py - RAG 有/无检索 A/B 对照实验
对照评审标准"生成质量是否因检索而显著提升"：
- 同一提示词模板，唯一变量 = 是否注入检索上下文（诗人小传 + 两级检索 top5 相似诗篇）
- 检索组件与生产一致：向量粗排 top20 + bge-reranker 精排 top5
- GLM-4-Flash 盲评乱序打分（1-10）：典故可信 / 意象关联 / 信息丰富 / 整体质量
- 引用归因三分法：grounded(命中检索结果) / in_corpus(库内真实但未被检索) / hallucinated(库外幻觉)
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
# 每组样本数：随机组 + 冷门诗人组，总量 = 2 × N_SAMPLES（默认 25 → 50 题评测集）
# 可用环境变量 AB_N 覆盖做小样本冒烟：AB_N=3 python scripts/rag_ab_test.py
N_SAMPLES = int(os.environ.get("AB_N", "25"))
SEED = 42

# 常见典籍/总集白名单：非单篇诗题，视为真实引用而非幻觉
# 匹配规则：精确匹配，或"《书名·篇名》"的书名部分匹配（如《庄子·逍遥游》→ 庄子）
CANON = {
    "诗经", "楚辞", "论语", "孟子", "庄子", "老子", "道德经", "南华经", "荀子", "韩非子",
    "左传", "国语", "战国策", "史记", "汉书", "后汉书", "三国志", "资治通鉴", "晋书", "宋书",
    "南齐书", "梁书", "陈书", "魏书", "北齐书", "周书", "隋书", "南史", "北史", "旧唐书", "新唐书",
    "山海经", "淮南子", "列子", "吕氏春秋", "礼记", "周易", "尚书", "尔雅", "说文解字", "公羊传", "谷梁传",
    "世说新语", "文选", "玉台新咏", "乐府诗集", "古诗十九首", "全唐诗", "全唐诗补编", "文苑英华", "唐文粹",
    "文心雕龙", "诗品", "沧浪诗话", "人间词话", "随园诗话", "水经注", "洛阳伽蓝记", "颜氏家训",
    "茶经", "金刚经", "心经", "法华经", "华严经", "维摩诘经", "楞严经", "涅槃经", "六祖坛经",
    "抱朴子", "搜神记", "拾遗记", "酉阳杂俎", "太平广记", "太平御览", "容斋随笔", "梦溪笔谈",
    "西京杂记", "三辅黄图", "吴越春秋", "越绝书", "博物志", "述异记", "幽明录", "续齐谐记",
    "荆楚岁时记", "开元天宝遗事", "明皇杂录", "大唐新语", "唐摭言", "北梦琐言", "唐语林",
    "神仙传", "列仙传", "高士传", "汉武故事", "洞冥记", "十洲记", "穆天子传", "飞燕外传",
    "桃花源记", "长恨歌传", "莺莺传", "霍小玉传", "李娃传", "枕中记", "南柯太守传", "虬髯客传",
    "离魂记", "任氏传", "柳毅传", "大唐西域记", "高僧传", "续高僧传", "宋高僧传", "景德传灯录",
    "五灯会元", "碧岩录", "大乘起信论", "摩诃止观", "证道歌", "信心铭",
    "苕溪渔隐丛话", "唐诗纪事", "诗人玉屑", "韵语阳秋", "诚斋诗话", "石林诗话", "彦周诗话",
    "困学纪闻", "日知录", "鹤林玉露", "渑水燕谈录", "邵氏闻见录",
}

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


def rerank(query, passages):
    """CrossEncoder 精排，返回每个 passage 的相关度分数（0~1）"""
    r = requests.post(f"{EMBED_URL}/rerank", json={"query": query[:400], "passages": passages}, timeout=60)
    return r.json()["scores"]


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


def topk(ids, mat, qv, exclude, k=20):
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


def check_citations(ans, retrieved_titles, own_title, title_set):
    """引用归因三分法 + 格式违规单列：
    - 标题比对按去空白归一化（库内标题常含排版空格，如《缘识  其一六》）
    - 《》内含句读标点（，。；、？！）或长度>12 且未命中检索结果的条目，
      视为"诗句/碎片摘录"计入格式违规，不计入幻觉引用
    典籍匹配：精确匹配，或《书名·篇名》/《书名:篇名》的书名部分在白名单内
    """
    cited = set(re.findall(r"《([^》]{1,30})》", ans))
    cited.discard(own_title)
    norm = lambda s: re.sub(r"\s+", "", s)
    retrieved_n = {norm(t) for t in retrieved_titles}
    grounded, in_corpus, hallucinated, format_violation = [], [], [], []

    def is_canon(t):
        if t in CANON:
            return True
        # 《庄子·逍遥游》→ 庄子；《史记:刺客列传》→ 史记
        head = re.split(r"[·:：]", t, maxsplit=1)[0].strip()
        return head in CANON

    for t in sorted(cited):
        tn = norm(t)
        if tn in retrieved_n:
            grounded.append(t)
        elif re.search(r"[，。；、？！]", t) or len(t) > 12:
            format_violation.append(t)  # 诗句/碎片摘录，非诗题声明
        elif is_canon(t):
            in_corpus.append(t)  # 典籍名按真实引用处理
        elif tn in title_set:
            in_corpus.append(t)  # 库内真实存在但未被检索（模型内知识）
        else:
            hallucinated.append(t)  # 库外幻觉
    return grounded, in_corpus, hallucinated, format_violation


def build_prompt(title, dynasty, author, body, bio_ctx, related_ctx):
    ctx = ""
    if bio_ctx:
        ctx += f"诗人小传：{bio_ctx}\n"
    if related_ctx:
        ctx += f"语义相似诗篇（向量检索）：\n{related_ctx}\n"
    ctx_block = f"\n【参考上下文（知识库检索结果）】\n{ctx}\n" if ctx else "\n"
    citation_rule = """
【引用要求】
1. 引用硬约束：仅允许引用上述"语义相似诗篇"列表中出现的诗篇作为论据，严禁引用列表之外的诗篇，不得杜撰诗题
2. 《书名号》内只允许填写诗篇标题本身，严禁将诗句、文句或"书名号"等占位文字写入《》内
3. 在【典故溯源】和【情感分析】中引用时，必须标注来源诗篇名，使用《书名号》
4. 最后在【引用诗篇】中列出所有被引用的诗篇名（一行一个，使用《书名号》；若未引用任何诗篇则输出"无"）""" if related_ctx else ""
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
（判断体裁、平仄特点、押韵与对仗情况，120字以内）{citation_rule}
"""


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

    # 全库诗题归一化集合（幻觉判定用，去空白避免排版空格误判）
    with conn.cursor() as cur:
        cur.execute("SELECT title FROM poems")
        title_set = {re.sub(r"\s+", "", r[0]) for r in cur.fetchall()}
    print(f"[corpus] 诗题集合 {len(title_set)} 条（去空白归一化）")

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
            # 两级检索：粗排 top20 → 精排 top5（与生产一致）
            coarse = topk(ids, mat, embed(qtext), p["id"], k=20)
            score_map = dict(coarse)
            with conn.cursor() as cur:
                fmt = ",".join(["%s"] * len(coarse))
                cur.execute(
                    f"SELECT id, title, author, dynasty, COALESCE(paragraphs_simp, paragraphs) FROM poems WHERE id IN ({fmt})",
                    [h[0] for h in coarse],
                )
                cands = []
                for pid, t, a, d, paras in cur.fetchall():
                    cands.append({
                        "id": pid, "title": t, "author": a, "dynasty": d,
                        "body": "".join(json.loads(paras) if paras else []),
                        "score": score_map[pid],
                    })
            scores = rerank(qtext, [f"《{c['title']}》{c['author']}：{c['body']}" for c in cands])
            for c, rs in zip(cands, scores):
                c["rerank_score"] = round(rs, 3)
            cands.sort(key=lambda c: c["rerank_score"], reverse=True)
            related_meta = cands[:5]
            with conn.cursor() as cur:
                cur.execute("SELECT bio_simp FROM poet_bios WHERE name=%s LIMIT 1", (p["author"],))
                row = cur.fetchone()
            bio_ctx = (row[0] or "")[:260] if row and row[0] else ""

            related_ctx = "\n".join(f"《{m['title']}》〔{m['dynasty']}〕{m['author']}：{m['body']}" for m in related_meta)
            top_str = "；".join(f"《{m['title']}》{m['rerank_score']}" for m in related_meta)
            print(f"  检索 top5（精排分）: {top_str}")

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

            # 引用归因三分法（两个回答都统计，对比幻觉率）
            retrieved = {m["title"] for m in related_meta}
            g_rag, c_rag, h_rag, f_rag = check_citations(ans_rag, retrieved, p["title"], title_set)
            g_base, c_base, h_base, f_base = check_citations(ans_base, retrieved, p["title"], title_set)

            results.append({"poem": p, "related": related_meta, "bio": bool(bio_ctx), "group": group_name,
                            "rag": ans_rag, "base": ans_base, "s_rag": s_rag, "s_base": s_base,
                            "reason": reason,
                            "cite_rag": {"grounded": g_rag, "in_corpus": c_rag, "hallucinated": h_rag, "format": f_rag},
                            "cite_base": {"grounded": g_base, "in_corpus": c_base, "hallucinated": h_base, "format": f_base}})
            sr = s_rag or {}
            sb2 = s_base or {}
            print(f"  有检索 zhengti={sr.get('zhengti')} vs 无检索 zhengti={sb2.get('zhengti')}")
            print(f"  引用归因 RAG: 命中{g_rag} 库内{c_rag} 幻觉{h_rag} 格式违规{f_rag}")
            print(f"  引用归因 BASE: 命中{g_base} 库内{c_base} 幻觉{h_base} 格式违规{f_base}")

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

    def cite_summary(rs):
        """幻觉引用率 = 幻觉引用数 / 总引用数（格式违规单列，不计入幻觉）"""
        def agg(key):
            g = sum(len(r[key]["grounded"]) for r in rs)
            c = sum(len(r[key]["in_corpus"]) for r in rs)
            h = sum(len(r[key]["hallucinated"]) for r in rs)
            fv = sum(len(r[key]["format"]) for r in rs)
            total = g + c + h
            return g, c, h, fv, total
        return agg("cite_rag"), agg("cite_base")

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
        (g1, c1, h1, f1, t1), (g2, c2, h2, f2, t2) = cite_summary(rs)
        hr_rag = round(h1 / t1 * 100, 1) if t1 else 0
        hr_base = round(h2 / t2 * 100, 1) if t2 else 0
        print(f"引用归因 RAG : 命中检索 {g1} / 库内真实 {c1} / 幻觉 {h1}（幻觉率 {hr_rag}%）/ 格式违规 {f1}")
        print(f"引用归因 BASE: 命中检索 {g2} / 库内真实 {c2} / 幻觉 {h2}（幻觉率 {hr_base}%）/ 格式违规 {f2}")

    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    with open(os.path.join(ROOT, "docs", "rag_ab_report.md"), "w", encoding="utf-8") as f:
        f.write(f"""# RAG 有/无检索 A/B 对照实验报告

> 实验日期：{time.strftime('%Y-%m-%d')} · 检索：BAAI/bge-small-zh-v1.5 向量粗排 top20 + BAAI/bge-reranker-base 精排 top5（语料 {len(ids)} 篇）· 生成模型：{LLM_MODEL}（temperature 0.6）
> 方法：对照实验，RAG 组注入检索上下文（诗人小传 + 两级检索相似诗篇）并施加引用硬约束（仅允许引用检索列表中的诗篇、《》内只填诗题），BASE 组无检索上下文；两个回答匿名乱序后由 {LLM_MODEL} 盲评打分（1-10），评分维度：典故可信 / 意象关联 / 信息丰富 / 整体质量。
> 分组：**随机组**（任意有小传的诗）考察普遍效果；**冷门诗人组**（小传 <100 字的长尾诗人）考察模型知识薄弱区检索的增益。
> 引用归因三分法：回答中引用的《诗题》按去空白归一化依次判定为 **命中检索**（出现在检索结果）、**库内真实**（存在于 5.7 万篇诗库/典籍白名单但未被检索）、**幻觉**（诗库中不存在的杜撰篇名）；**格式违规**（《》内摘录诗句/碎片而非诗题）单列，不计入幻觉。

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
## 二、引用归因与幻觉率对比

> 幻觉引用 = 回答中提到的《诗题》在 5.7 万篇诗库中完全不存在（典型大模型杜撰）；格式违规 =《》内摘录诗句/碎片而非诗题，单列不计入幻觉率。

| 分组 | 回答 | 命中检索 | 库内真实 | 幻觉引用 | 幻觉率 | 格式违规 |
| --- | --- | --- | --- | --- | --- | --- |
""")
        for name, label in [("random", "随机组"), ("cold", "冷门诗人组"), ("all", "全部样本")]:
            rs = results if name == "all" else [r for r in results if r["group"] == name]
            if not rs:
                continue
            (g1, c1, h1, f1, t1), (g2, c2, h2, f2, t2) = cite_summary(rs)
            hr_rag = round(h1 / t1 * 100, 1) if t1 else 0
            hr_base = round(h2 / t2 * 100, 1) if t2 else 0
            f.write(f"| {label} | 有检索 RAG | {g1} | {c1} | {h1} | **{hr_rag}%** | {f1} |\n")
            f.write(f"| {label} | 无检索 | {g2} | {c2} | {h2} | **{hr_base}%** | {f2} |\n")

        f.write("""
## 三、逐样本引用归因明细

| 样本 | 分组 | 回答 | 命中检索 | 库内真实 | 幻觉引用 | 格式违规 |
| --- | --- | --- | --- | --- | --- | --- |
""")
        for r in results:
            name = f"《{r['poem']['title']}》{r['poem']['author']}"
            for arm, key in [("RAG", "cite_rag"), ("BASE", "cite_base")]:
                c = r[key]
                g = "、".join(f"《{t}》" for t in c["grounded"]) or "—"
                ic = "、".join(f"《{t}》" for t in c["in_corpus"]) or "—"
                h = "、".join(f"《{t}》" for t in c["hallucinated"]) or "—"
                fv = "、".join(f"《{t}》" for t in c["format"]) or "—"
                f.write(f"| {name} | {r['group']} | {arm} | {g} | {ic} | {h} | {fv} |\n")

        f.write("""
## 四、检索命中示例（grounding）

| 样本 | 分组 | 精排 top1 | 精排分 | 粗排余弦 |
| --- | --- | --- | --- | --- |
""")
        for r in results:
            top1 = r["related"][0] if r["related"] else None
            t1 = f"《{top1['title']}》" if top1 else "—"
            s1 = str(top1["rerank_score"]) if top1 else "—"
            s2 = str(top1["score"]) if top1 else "—"
            f.write(f"| 《{r['poem']['title']}》{r['poem']['author']} | {r['group']} | {t1} | {s1} | {s2} |\n")

        f.write("\n## 五、逐样本盲评明细\n")
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
