# -*- coding: utf-8 -*-
"""check_embed_progress.py - 查看 chunks 向量化进度"""
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
    host=cfg.get("MYSQL_HOST", "127.0.0.1"),
    port=int(cfg.get("MYSQL_PORT", "3306")),
    user=cfg.get("MYSQL_USER", "root"),
    password=cfg.get("MYSQL_PASSWORD", ""),
    database=cfg.get("MYSQL_DATABASE", "ai_poetry"),
    charset="utf8mb4",
)
cur = conn.cursor()
cur.execute("SELECT chunk_type, COUNT(*) FROM chunks WHERE embedding IS NOT NULL GROUP BY chunk_type")
print("已向量化:", cur.fetchall())
cur.execute("SELECT COUNT(*) FROM poems")
print("poems 总数:", cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM poet_bios")
print("bios 总数:", cur.fetchone()[0])
conn.close()
