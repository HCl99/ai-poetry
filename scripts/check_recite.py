"""g3 背诵闯关：抽题、交卷判分、学习路径进度三联验证"""
import requests

BASE = "http://localhost:3000"
s = requests.Session()
csrf = s.get(f"{BASE}/api/auth/csrf").json()["csrfToken"]
s.post(f"{BASE}/api/auth/callback/credentials",
       data={"email": "test@poetry.ai", "password": "test123456", "csrfToken": csrf, "json": "true"},
       allow_redirects=False)

# 1) 三种来源抽题
for src in ("daily", "fav", "random"):
    r = s.get(f"{BASE}/api/recite/poem?source={src}")
    d = r.json()
    print(f"抽题[{src}] HTTP {r.status_code}: 《{d.get('title')}》〔{d.get('dynasty')}〕{d.get('author')} · {len(d.get('lines', []))} 句")
    assert r.status_code == 200 and len(d.get("lines", [])) >= 2, f"{src} 抽题失败"
    if src == "daily":
        daily = d

# 2) 交卷：故意答对一半
lines = daily["lines"]
total = len(lines)
correct = max(1, total // 2)
r = s.post(f"{BASE}/api/recite/result",
           json={"poemId": daily["id"], "title": daily["title"], "mode": "mask", "total": total, "correct": correct})
d = r.json()
print(f"\n交卷 HTTP {r.status_code}: readCount={d.get('readCount')}")
assert r.status_code == 200 and d.get("ok")

# 3) 学习记录出现背诵条目
r = s.get(f"{BASE}/api/user/history")
items = r.json()
top = items[0]
print("最近一条学习记录:", top["typeLabel"], "|", top["title"], "|", top["desc"])
assert top["type"] == "recite" and "背诵闯关" in top["title"]

# 4) 工作台学习路径含闯关入口
t = s.get(f"{BASE}/workbench").text
print("\n工作台含「背诵闯关 · 研习」:", "背诵闯关 · 研习" in t)
print("启蒙诵读链接指向 /workbench/recite:", 'href="/workbench/recite"' in t)
print("侧边栏含背诵闯关导航:", "背诵闯关" in t)

# 5) 参数校验：缺参数应 400
r = s.post(f"{BASE}/api/recite/result", json={"poemId": daily["id"]})
print("缺参数交卷 HTTP:", r.status_code, "(期望 400)")
assert r.status_code == 400
