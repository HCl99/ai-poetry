"""图谱问答 GraphRAG API 实测：POST /api/graph-qa {kind, question} → SSE
覆盖 4 个分支：poet 命中 / poet 全局摘要 / imagery 命中 / imagery 全局摘要
"""
import json
import re
import requests

BASE = "http://localhost:3000"
s = requests.Session()
csrf = s.get(f"{BASE}/api/auth/csrf").json()["csrfToken"]
r = s.post(f"{BASE}/api/auth/callback/credentials",
           data={"email": "test@poetry.ai", "password": "test123456", "csrfToken": csrf, "json": "true"},
           allow_redirects=False)
assert r.status_code in (200, 302), f"登录失败: {r.status_code}"


def run(kind: str, question: str, must_contain: list[str] | None = None) -> bool:
    print(f"\n=== [{kind}] {question} ===")
    r = s.post(f"{BASE}/api/graph-qa", json={"kind": kind, "question": question}, stream=True, timeout=90)
    print("HTTP:", r.status_code, "content-type:", r.headers.get("content-type"))
    assert r.headers.get("content-type", "").startswith("text/event-stream"), "应为 SSE"

    events, answer, ctx = [], [], []
    cur = None
    for raw in r.iter_lines(decode_unicode=True):
        if not raw:
            continue
        if raw.startswith("event:"):
            cur = raw[6:].strip()
        elif raw.startswith("data:"):
            d = json.loads(raw[5:])
            events.append((cur, d))
            if cur == "delta":
                answer.append(d.get("text", ""))
            elif cur == "done":
                ctx = d.get("context", [])

    kinds = {}
    for ev, _ in events:
        kinds[ev] = kinds.get(ev, 0) + 1
    text = "".join(answer)
    print("事件统计:", kinds)
    print("回答长度:", len(text), "| 耗时:", next((d.get("latencyMs") for e, d in events if e == "done"), None), "ms")
    print("回答预览:", text[:150])
    print("图谱依据条数:", len(ctx))
    for c in ctx[:4]:
        print("  ctx:", c[:90])

    ok = bool(text) and len(ctx) > 0
    # 杜撰校验：回答中出现的数字/次数必须能在 ctx 中找到出处
    nums = set(re.findall(r"\d{2,}", text))
    ctx_nums = set(re.findall(r"\d+", " ".join(ctx)))
    fabricated = [n for n in nums if n not in ctx_nums]
    if fabricated:
        print("可疑数字（不在图谱数据中）:", fabricated)
        ok = False
    if must_contain:
        missing = [m for m in must_contain if m not in " ".join(ctx) + text]
        if missing:
            print("应出现但缺失:", missing)
            ok = False
    print("结论:", "PASS" if ok else "FAIL")
    return ok


results = [
    run("poet", "李白与哪些诗人交往最密切？", must_contain=["李白"]),
    run("poet", "这个图谱里关联最广的诗人是谁？"),
    run("imagery", "意象「月」常与哪些意象共现？", must_contain=["月"]),
    run("imagery", "意象库里出现最多的意象是什么？"),
]

print("\n========== 总体:", "ALL PASS" if all(results) else "存在 FAIL", "==========")
