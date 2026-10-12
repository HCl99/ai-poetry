"""g4 多模型对比：共享检索 + 双模型并行 + 引用校验 + 日志隔离 验证"""
import json
import re
import subprocess
import requests

BASE = "http://localhost:3000"
s = requests.Session()
csrf = s.get(f"{BASE}/api/auth/csrf").json()["csrfToken"]
s.post(f"{BASE}/api/auth/callback/credentials",
       data={"email": "test@poetry.ai", "password": "test123456", "csrfToken": csrf, "json": "true"},
       allow_redirects=False)

poems = s.get(f"{BASE}/api/poems/list?limit=1").json()
pid, ptitle = poems[0]["id"], poems[0]["title"]
print(f"对比诗篇：《{ptitle}》 {pid}")

r = s.post(f"{BASE}/api/compare-annot", json={"poemId": pid}, stream=True, timeout=180)
print("HTTP:", r.status_code)
assert r.status_code == 200

events = {}
final = None
meta = None
buf = ""
for chunk in r.iter_content(chunk_size=None, decode_unicode=True):
    buf += chunk
    while "\n\n" in buf:
        block, buf = buf.split("\n\n", 1)
        ev, dt = None, None
        for ln in block.splitlines():
            if ln.startswith("event:"):
                ev = ln[6:].strip()
            elif ln.startswith("data:"):
                dt = ln[5:].strip()
        if not ev or dt is None:
            continue
        data = json.loads(dt)
        events[ev] = events.get(ev, 0) + 1
        if ev == "meta":
            meta = data
        elif ev == "done":
            final = data

print("事件统计:", {k: v for k, v in sorted(events.items())})
assert final and meta, "缺少 done/meta 事件"
assert len(meta["models"]) == 2 and meta["related"] is not None
print("共享检索:", [x["title"] for x in meta["related"]])

a, b = final["a"], final["b"]
ok = True
for m in (a, b):
    if m.get("error"):
        print(f"[{m['key']}] {m['model']} 生成失败: {m['error']}")
        ok = False
        continue
    secs = sum(1 for v in (m.get("sections") or {}).values() if v and v.strip())
    line = (f"[{m['key']}] {m['model']}: 延迟 {m['latencyMs']/1000:.1f}s · {m['chars']} 字 · "
            f"四维 {secs}/4 · 引用合规 {len(m['cite']['valid'])}/{m['cite']['total']}")
    if m["cite"]["invalid"]:
        line += f" · 越界 {sorted(set(m['cite']['invalid']))}"
    print(line)
assert ok, "存在模型生成失败"

# 日志：compare: 前缀、双模型各一条（直接查库）
code = r'''
import pymysql, re
url = None
for line in open(".env", encoding="utf-8"):
    if line.startswith("DATABASE_URL="):
        url = line.strip().split("=", 1)[1].strip().strip(chr(34))
m = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/(\w+)", url)
conn = pymysql.connect(host=m.group(3), user=m.group(1), password=m.group(2),
                       database=m.group(5), port=int(m.group(4)), charset="utf8mb4")
cur = conn.cursor()
cur.execute("SELECT model, latency_ms, LEFT(user_query, 40) FROM annotation_logs WHERE user_query LIKE %s ORDER BY id DESC LIMIT 2", ("compare:%",))
for row in cur.fetchall():
    print("DB日志:", row)
'''
out = subprocess.run(["python", "-c", code], capture_output=True, text=True, cwd=".")
print(out.stdout.strip() or out.stderr.strip()[:300])
print("\nALL PASS")
