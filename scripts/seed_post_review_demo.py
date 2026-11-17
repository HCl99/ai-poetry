# -*- coding: utf-8 -*-
"""帖子审核演示数据：全部通过真实业务接口产生，不直接写库。

用途：让 /admin/posts 的待审核 / 已通过 / 已拒绝 / 已撤回四个分栏，
以及「操作历史」分栏都有可演示的真实数据。发帖、审批、撤回会同时
写入 post_review_logs 审核记录，正好覆盖需求文档 3.2.15 的审核历史。

    python scripts/seed_post_review_demo.py

幂等：已存在同名标题的帖子会跳过，重复执行不会无限堆积。
清理：node scripts/clean_post_review_demo.mjs
"""
import json
import os
import sys
import time
import requests

BASE = os.environ.get("DEMO_BASE", "http://localhost:3000")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USER_ACCOUNT = ("test@poetry.ai", "test123456")
ADMIN_ACCOUNT = ("admin@poetry.ai", "admin123")
STATUSES = ("pending", "approved", "rejected", "withdrawn")


def login(email, password):
    s = requests.Session()
    csrf = s.get(f"{BASE}/api/auth/csrf", timeout=15).json()["csrfToken"]
    r = s.post(
        f"{BASE}/api/auth/callback/credentials",
        # auth.ts 的 Credentials provider 字段名是 account（支持邮箱或用户名），不是 email
        data={"account": email, "password": password, "csrfToken": csrf, "json": "true"},
        allow_redirects=False,
        timeout=15,
    )
    if r.status_code not in (200, 302):
        raise RuntimeError(f"{email} 登录失败: HTTP {r.status_code}")
    me = s.get(f"{BASE}/api/auth/session", timeout=15).json() or {}
    if not me.get("user"):
        raise RuntimeError(f"{email} 未拿到有效会话，请检查账号密码")
    return s


def existing_titles(admin):
    """按四个状态分栏收集已有标题，用于幂等跳过"""
    titles = set()
    for st in STATUSES:
        r = admin.get(f"{BASE}/api/admin/posts", params={"status": st, "size": 50}, timeout=15)
        if r.ok:
            titles.update(x["title"] for x in r.json()["items"])
        else:
            print(f"  ! 读取 {st} 分栏失败: HTTP {r.status_code}")
    # 已被删除的演示帖不在任何分栏里，但操作历史仍留痕，据此避免重复创建
    r = admin.get(f"{BASE}/api/admin/post-logs", params={"size": 50}, timeout=15)
    if r.ok:
        titles.update(x["postTitle"] for x in r.json()["items"])
    return titles


def summary(admin):
    counts = {}
    for st in STATUSES:
        r = admin.get(f"{BASE}/api/admin/posts", params={"status": st, "size": 50}, timeout=15)
        counts[st] = r.json()["total"] if r.ok else "?"
    logs = admin.get(f"{BASE}/api/admin/post-logs", params={"size": 5}, timeout=15)
    total_logs = logs.json()["total"] if logs.ok else "?"
    print("\n========== 当前审核台数据 ==========")
    for st, label in zip(STATUSES, ("待审核", "已通过", "已拒绝", "已撤回")):
        print(f"  {label}: {counts[st]} 条")
    print(f"  操作历史: {total_logs} 条")


def main():
    with open(os.path.join(ROOT, "scripts", "post_review_demo_data.json"), encoding="utf-8") as f:
        demo = json.load(f)

    print(f"目标服务: {BASE}")
    r = requests.get(f"{BASE}/login", timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"服务未就绪: /login HTTP {r.status_code}")

    user = login(*USER_ACCOUNT)
    admin = login(*ADMIN_ACCOUNT)
    print("两个账号登录成功")

    known = existing_titles(admin)
    created = []
    for item in demo:
        if item["title"] in known:
            print(f"  跳过（已存在）: {item['title']}")
            continue
        # 拉开提交时间，操作历史里呈现真实的先后时序，而不是同一秒的批量记录
        time.sleep(1.1)
        r = user.post(
            f"{BASE}/api/posts",
            json={"title": item["title"], "content": item["content"], "category": item["category"]},
            timeout=15,
        )
        if not r.ok:
            print(f"  ! 发帖失败: {item['title']} -> {r.status_code} {r.text[:120]}")
            continue
        d = r.json()
        created.append((item, d["id"]))
        tag = "（命中敏感词，已自动标记）" if d.get("flagged") else ""
        print(f"  已投稿: {item['title']} -> #{d['id']} [{d['status']}]{tag}")

    # 审批 / 撤回放在全部发帖之后，操作历史里能看出清晰的时序
    for item, pid in created:
        flow = item["flow"]
        if flow not in ("approve", "reject", "withdraw", "delete"):
            continue
        time.sleep(0.9)
        if flow == "approve":
            r = admin.put(f"{BASE}/api/admin/posts", json={"id": pid, "action": "approve"}, timeout=15)
            print(f"  管理员通过 #{pid}: HTTP {r.status_code}")
        elif flow == "reject":
            r = admin.put(
                f"{BASE}/api/admin/posts",
                json={"id": pid, "action": "reject", "note": item["note"]},
                timeout=15,
            )
            print(f"  管理员拒绝 #{pid}: HTTP {r.status_code}")
        elif flow == "withdraw":
            r = user.put(f"{BASE}/api/posts/{pid}", json={"action": "withdraw"}, timeout=15)
            print(f"  作者撤回 #{pid}: HTTP {r.status_code}")
        elif flow == "delete":
            r = admin.put(
                f"{BASE}/api/admin/posts",
                json={"id": pid, "action": "delete", "note": item.get("note", "")},
                timeout=15,
            )
            print(f"  管理员删除 #{pid}: HTTP {r.status_code}")

    summary(admin)
    print("\n提示: 这些数据走的是真实发帖/审批链路，可用 node scripts/clean_post_review_demo.mjs 清理。")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f"[FAIL] {e}", file=sys.stderr)
        sys.exit(1)
