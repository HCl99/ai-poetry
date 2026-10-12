# -*- coding: utf-8 -*-
"""seed_test_account.py - 为评审测试账号补齐示例收藏/笔记（幂等）"""
import os
import uuid

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
cur.execute("SELECT id FROM users WHERE email='test@poetry.ai'")
row = cur.fetchone()
if not row:
    print("[FAIL] test@poetry.ai 不存在")
    raise SystemExit(1)
uid = row[0]

# 挑有名气的诗做示例收藏
cur.execute(
    """SELECT id, title, author FROM poems
       WHERE author IN ('李白','杜甫','王维','苏轼','李商隐') AND CHAR_LENGTH(title) <= 12
       ORDER BY RAND(7) LIMIT 3"""
)
poems = cur.fetchall()
for pid, title, author in poems:
    cur.execute(
        "INSERT IGNORE INTO favorites (user_id, poem_id) VALUES (%s, %s)", (uid, pid)
    )
    print(f"[fav] 《{title}》{author}")

cur.execute(
    "INSERT IGNORE INTO notes (id, user_id, title, content) VALUES (%s, %s, %s, %s)",
    (str(uuid.uuid4()), uid, "读《静夜思》随记",
     "「疑是地上霜」以霜喻月光，清冷之境顿生。日后 AI 注解时可对比《古诗十九首》中的月意象。"),
)
print("[note] 1 条随记")
conn.commit()

for table, label in [("favorites", "收藏"), ("notes", "笔记")]:
    cur.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id=%s", (uid,))
    print(f"  {label}: {cur.fetchone()[0]} 条")
conn.close()
print("[DONE] 测试账号数据就绪")
