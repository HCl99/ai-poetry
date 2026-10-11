# -*- coding: utf-8 -*-
"""db_stats.py - 语料统计"""
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
cur.execute("SELECT COUNT(*) FROM poems WHERE tags IS NOT NULL AND tags != '[]'")
print("tagged poems:", cur.fetchone()[0])
cur.execute("SELECT dynasty, COUNT(*) FROM poems GROUP BY dynasty ORDER BY 2 DESC LIMIT 10")
print("dynasty dist:", cur.fetchall())
cur.execute("SELECT COUNT(*) FROM poems WHERE author IN ('李白','杜甫','苏轼','王维','李清照','白居易','辛弃疾','李商隐','杜牧','陆游')")
print("famous-author poems:", cur.fetchone()[0])
conn.close()
