"""g1 搜索历史词云：API + 数据大屏页面双重验证"""
import requests

BASE = "http://localhost:3000"
s = requests.Session()
csrf = s.get(f"{BASE}/api/auth/csrf").json()["csrfToken"]
s.post(f"{BASE}/api/auth/callback/credentials",
       data={"email": "test@poetry.ai", "password": "test123456", "csrfToken": csrf, "json": "true"},
       allow_redirects=False)

# 1) API
r = s.get(f"{BASE}/api/query-cloud")
print("API HTTP:", r.status_code)
data = r.json()
print("扫描日志条数 total:", data.get("total"))
words = data.get("words", [])
print("词数:", len(words))
print("Top 15:", [(w["text"], w["count"]) for w in words[:15]])
assert r.status_code == 200 and isinstance(words, list)
bad = [w["text"] for w in words if len(w["text"]) < 2 or any(c in w["text"] for c in "的了你吗呢吧")]
print("含停用字/单字的词:", bad or "无")

# 2) 数据大屏页面
p = s.get(f"{BASE}/workbench/stats")
t = p.text
print("\n页面 HTTP:", p.status_code)
for kw in ("用户都在问什么", "检索词云", "真实检索提问"):
    print(f"  含「{kw}」:", kw in t)
if words:
    print("  页面含榜首词:", words[0]["text"] in t)
