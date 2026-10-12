# -*- coding: utf-8 -*-
"""check_test_account.py - 检查评审测试账号数据完整性"""
import os
import pymysql

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            cfg[k.strip()] = v

conn = pymysql.connect(
    host=cfg["MYSQL_HOST"], port=int(cfg["MYSQL_PORT"]), user=cfg["MYSQL_USER"],
    password=cfg["MYSQL_PASSWORD"], database=cfg["MYSQL_DATABASE"], charset="utf8mb4",
)
cur = conn.cursor()
cur.execute("SELECT id, email, name FROM users WHERE email='test@poetry.ai'")
row = cur.fetchone()
if not row:
    print("[FAIL] test@poetry.ai 不存在")
    raise SystemExit(1)
uid = row[0]
print(f"[OK] 账号存在: {row[1]} ({row[2]}) id={uid}")
for table, label in [("favorites", "收藏"), ("histories", "历史"), ("creations", "创作"), ("notes", "笔记")]:
    cur.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id=%s", (uid,))
    n = cur.fetchone()[0]
    print(f"  {label}: {n} 条 {'[OK]' if n > 0 else '[空]'}")
conn.close()
