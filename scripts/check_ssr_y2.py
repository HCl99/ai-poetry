"""验证 /workbench/graph 的 SSR HTML 中 y2 坐标是否为 round2 后的值"""
import re
import requests

BASE = "http://localhost:3000"
s = requests.Session()
csrf = s.get(f"{BASE}/api/auth/csrf").json()["csrfToken"]
r = s.post(
    f"{BASE}/api/auth/callback/credentials",
    data={"email": "test@poetry.ai", "password": "test123456", "csrfToken": csrf, "json": "true"},
    allow_redirects=False,
)
assert r.status_code in (200, 302), f"登录失败: {r.status_code}"

html = s.get(f"{BASE}/workbench/graph").text
vals = re.findall(r'y2="([^"]+)"', html)
print(f"y2 属性共 {len(vals)} 个")
long_vals = [v for v in vals if "." in v and len(v.split(".")[-1]) > 2]
print(f"小数位超过2位的: {len(long_vals)} 个")
for v in vals[:6]:
    print("  样例:", v)
if long_vals:
    print("  未截断样例:", long_vals[:3])
print("结论:", "SSR 仍是旧代码（浮点未截断）" if long_vals else "SSR 已是 round2 截断值，服务端代码已生效")
