"""数据大屏页面 SSR 渲染验证"""
import re
import requests

BASE = "http://localhost:3000"
s = requests.Session()
csrf = s.get(f"{BASE}/api/auth/csrf").json()["csrfToken"]
s.post(f"{BASE}/api/auth/callback/credentials",
       data={"email": "test@poetry.ai", "password": "test123456", "csrfToken": csrf, "json": "true"},
       allow_redirects=False)

r = s.get(f"{BASE}/workbench/stats")
t = r.text
print("HTTP:", r.status_code)
for kw in ("数据大屏", "诗篇总量", "朝代分布", "意象词云", "检索热力", "高频意象", "近 14 天"):
    print(f"  含「{kw}」:", kw in t)
print("侧边栏导航含数据大屏:", 'href="/workbench/stats"' in t)
nums = re.findall(r"font-brush text-3xl text-ink-deep[^>]*>([^<]+)<", t)
print("统计卡片数值:", nums[:8])
# 朝代分布条目（诗篇段）
dyn = re.findall(r"font-brush text-lg[^>]*>([^<]{1,3})</span>", t)
print("朝代标签:", dyn[:12])
