# -*- coding: utf-8 -*-
"""
gen_shangxi_llm.py - 用智谱GLM-4-Flash批量生成唐诗三百首赏析
输出: data/shangxi.json
- 每条: {local_id, local_title, local_author, fanyi, shangxi, zhushihui, source, model}
- source="AI生成(GLM-4-Flash)"，local_id=chinese-poetry的诗id（用于RAG引用追溯）
"""
import os
import re
import json
import time
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI
from opencc import OpenCC

TANG_300 = r"c:\Users\Lenovo\Desktop\传智杯\chinese-poetry-master\全唐诗\唐诗三百首.json"
OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "shangxi.json")
MODEL = "glm-4-flash"
SOURCE_LABEL = "AI生成(GLM-4-Flash)"

cc = OpenCC("t2s")

api_key = os.environ["zhipuai_api_key"]
base_url = os.environ.get("zhipuai_base_url", "https://open.bigmodel.cn/api/paas/v4")
if not base_url.rstrip("/").endswith("/v4"):
    base_url = base_url.rstrip("/") + "/api/paas/v4"

_client = OpenAI(api_key=api_key, base_url=base_url)


def build_prompt(p):
    title = cc.convert(p["title"])
    author = cc.convert(p["author"])
    paragraphs = " ".join(cc.convert(x) for x in p["paragraphs"])
    return f"""为下面这首古诗生成三段内容。

诗题：{title}
作者：{author}
原文：{paragraphs}

请输出一个**单一**的JSON对象，包含且仅包含三个字段：fanyi、shangxi、zhushihui。
- fanyi: 白话译文（不超过200字，只给译文不解释）
- shangxi: 赏析（300字以内，讲写作背景+艺术手法+情感主旨）
- zhushihui: 重点字词注释（3-5条，每条格式"字:释义"，条目之间用顿号分隔）

要求：只输出JSON，不要```json```包裹、不要任何前后说明文字。例如：
{{"fanyi":"...","shangxi":"...","zhushihui":"字1:释义1、字2:释义2"}}"""


def parse_llm_json(text):
    """从LLM输出中提取单一JSON对象"""
    # 去除```json```包裹
    text = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    # 找第一个{}到匹配}结束
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    raw = m.group(0)
    # 修复：模型可能输出3个并列{}块，取第一个并合并
    blocks = re.findall(r"\{[^{}]*\}", raw)
    if len(blocks) >= 3:
        merged = {}
        for b in blocks[:3]:
            try:
                merged.update(json.loads(b))
            except json.JSONDecodeError:
                pass
        if merged:
            return merged
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # 修复尾逗号、缺引号等
        try:
            raw2 = re.sub(r",\s*([}\]])", r"\1", raw)  # 去尾逗号
            raw2 = re.sub(r"([{,]\s*)([a-zA-Z_]+):", r'\1"\2":', raw2)  # key加引号
            return json.loads(raw2)
        except Exception:
            return None


def gen_one(poem, idx, total):
    """生成一首诗的赏析，最多重试3次"""
    title = cc.convert(poem["title"])
    author = cc.convert(poem["author"])
    prompt = build_prompt(poem)
    last_err = ""
    for attempt in range(3):
        try:
            resp = _client.chat.completions.create(
                model=MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                timeout=30,
            )
            text = resp.choices[0].message.content.strip()
            parsed = parse_llm_json(text)
            if not parsed or not parsed.get("fanyi"):
                last_err = f"parse_empty raw={text[:100]}"
                continue
            rec = {
                "local_id": poem.get("id", ""),
                "local_title": title,
                "local_author": author,
                "fanyi": parsed.get("fanyi", "").strip(),
                "shangxi": parsed.get("shangxi", "").strip(),
                "zhushihui": parsed.get("zhushihui", "").strip(),
                "source": SOURCE_LABEL,
                "model": MODEL,
                "tags": poem.get("tags", []),
                "paragraphs_simp": [cc.convert(x) for x in poem.get("paragraphs", [])],
            }
            print(f"[OK] {idx}/{total} {title}-{author}")
            return rec
        except Exception as e:
            last_err = str(e)
            time.sleep(2)
    print(f"[FAIL] {idx}/{total} {title}-{author}: {last_err[:80]}")
    return {
        "local_id": poem.get("id", ""),
        "local_title": title,
        "local_author": author,
        "fanyi": "",
        "shangxi": "",
        "zhushihui": "",
        "source": SOURCE_LABEL,
        "model": MODEL,
        "tags": poem.get("tags", []),
        "paragraphs_simp": [cc.convert(x) for x in poem.get("paragraphs", [])],
        "error": last_err,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只处理前N首，0=全部")
    ap.add_argument("--workers", type=int, default=5, help="并发数")
    args = ap.parse_args()

    with open(TANG_300, "r", encoding="utf-8") as f:
        poems = json.load(f)
    if args.limit > 0:
        poems = poems[: args.limit]
    total = len(poems)
    print(f"[INFO] 待处理: {total} 首, 并发: {args.workers}")

    results = [None] * total
    ok = 0
    fail = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(gen_one, p, i + 1, total): i for i, p in enumerate(poems)}
        for fut in as_completed(futs):
            i = futs[fut]
            rec = fut.result()
            results[i] = rec
            if rec.get("fanyi"):
                ok += 1
            else:
                fail += 1
            # 每10首保存一次
            done = ok + fail
            if done % 10 == 0:
                elapsed = time.time() - t0
                avg = elapsed / done
                eta = avg * (total - done)
                print(f"[PROGRESS] done={done}/{total} ok={ok} fail={fail} "
                      f"elapsed={elapsed:.0f}s eta={eta:.0f}s")
                with open(OUT_PATH, "w", encoding="utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"[DONE] 输出: {OUT_PATH}")
    print(f"[STATS] 成功 {ok}/{total} 失败 {fail} 耗时 {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
