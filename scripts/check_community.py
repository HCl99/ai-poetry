"""作品社区 API 实测：GET / POST(publish/unpublish/like) + 越权校验"""
import requests

BASE = "http://localhost:3000"
s = requests.Session()
csrf = s.get(f"{BASE}/api/auth/csrf").json()["csrfToken"]
r = s.post(f"{BASE}/api/auth/callback/credentials",
           data={"email": "test@poetry.ai", "password": "test123456", "csrfToken": csrf, "json": "true"},
           allow_redirects=False)
assert r.status_code in (200, 302), f"登录失败: {r.status_code}"


def post(action, creation_id):
    return s.post(f"{BASE}/api/community", json={"action": action, "creationId": creation_id})


ok = True

# 1. 列表
r = s.get(f"{BASE}/api/community")
d = r.json()
print("1) GET 列表:", r.status_code, "| 我的创作:", len(d["mine"]), "| 广场:", len(d["feed"]))
ok &= r.status_code == 200
if not d["mine"]:
    print("   !! 测试账号无创作记录，无法继续")
    raise SystemExit(1)

target = d["mine"][0]
cid = target["id"]
print("   目标作品:", cid, "|", target["style"], "|", target["content"][:24])

# 2. 发布
r = post("publish", cid)
print("2) 发布:", r.status_code, r.json())
ok &= r.status_code == 200 and r.json().get("isPublic") is True

# 3. 广场可见
d2 = s.get(f"{BASE}/api/community").json()
in_feed = any(x["id"] == cid for x in d2["feed"])
print("3) 广场可见:", in_feed)
ok &= in_feed

# 4. 点赞 → 取消 → 再点赞（留下正数状态）
r = post("like", cid)
like1 = r.json()
print("4) 点赞:", r.status_code, like1)
ok &= r.status_code == 200 and like1.get("likedByMe") is True and like1.get("likes") == 1
r = post("like", cid)
like2 = r.json()
print("   取消:", r.status_code, like2)
ok &= like2.get("likedByMe") is False and like2.get("likes") == 0
r = post("like", cid)
like3 = r.json()
print("   再赞:", r.status_code, like3)
ok &= like3.get("likedByMe") is True and like3.get("likes") == 1

# 5. 撤回后点赞应 403
r = post("unpublish", cid)
print("5) 撤回:", r.status_code, r.json())
ok &= r.json().get("isPublic") is False
r = post("like", cid)
print("   未发布点赞:", r.status_code, r.json())
ok &= r.status_code == 403

# 6. 重复发布幂等
r = post("publish", cid)
r2 = post("publish", cid)
ok &= r.status_code == 200 and r2.status_code == 200
print("6) 重复发布幂等:", r2.status_code, r2.json())
# 恢复初始状态（撤回 + 清赞）
post("unpublish", cid)
post("like", cid) if like3.get("likedByMe") else None
d3 = s.get(f"{BASE}/api/community").json()
print("恢复后广场数量:", len(d3["feed"]))

print("\n========== 总体:", "ALL PASS" if ok else "存在 FAIL", "==========")
