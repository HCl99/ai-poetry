"""多轮追问 API 实测：POST /api/annotation {poemId, question, history} → SSE"""
import json
import requests

BASE = "http://localhost:3000"
s = requests.Session()
csrf = s.get(f"{BASE}/api/auth/csrf").json()["csrfToken"]
r = s.post(f"{BASE}/api/auth/callback/credentials",
           data={"email": "test@poetry.ai", "password": "test123456", "csrfToken": csrf, "json": "true"},
           allow_redirects=False)
assert r.status_code in (200, 302), f"登录失败: {r.status_code}"

poem_id = s.get(f"{BASE}/api/poems/list?limit=1").json()[0]["id"]
print("poemId:", poem_id)

body = {
    "poemId": poem_id,
    "question": "诗中用了哪些典故？",
    "history": [{"role": "user", "content": "这首诗好在哪里？"}, {"role": "assistant", "content": "此诗意象清丽，情感含蓄。"}],
}
r = s.post(f"{BASE}/api/annotation", json=body, stream=True, timeout=90)
print("HTTP:", r.status_code, "content-type:", r.headers.get("content-type"))
assert r.headers.get("content-type", "").startswith("text/event-stream"), "应为 SSE"

events = []
cur_event = None
answer = []
for raw in r.iter_lines(decode_unicode=True):
    if not raw:
        continue
    if raw.startswith("event:"):
        cur_event = raw[6:].strip()
    elif raw.startswith("data:"):
        data = json.loads(raw[5:])
        events.append((cur_event, data))
        if cur_event == "delta":
            answer.append(data.get("text", ""))

kinds = {}
for ev, _ in events:
    kinds[ev] = kinds.get(ev, 0) + 1
print("事件统计:", kinds)
steps = [d.get("detail", "") for ev, d in events if ev == "step"]
for st in steps:
    print("step:", st)
meta = next((d for ev, d in events if ev == "meta"), None)
if meta:
    print("meta related:", [x["title"] for x in meta.get("related", [])])
done = next((d for ev, d in events if ev == "done"), None)
print("done:", {k: done[k] for k in ("latencyMs", "model")} if done else None)
text = "".join(answer)
print("回答长度:", len(text))
print("回答预览:", text[:200])
# 引用校验：回答中的《诗题》是否都在 meta.related 列表内
import re
cited = set(re.findall(r"《([^》]{1,30})》", text))
allowed = {x["title"] for x in (meta or {}).get("related", [])}
illegal = cited - allowed - {json.loads(raw[5:]).get("title", "") for ev, raw in []}
print("引用诗题:", cited or "无", "| 越界引用:", (cited - allowed) or "无")
print("结论:", "PASS" if done and text else "FAIL")
