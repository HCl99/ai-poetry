# -*- coding: utf-8 -*-
"""build_poet_relations.py - 基于 poet_bios 互提构建诗人关系图
规则：诗人 A 的小传中提及诗人 B，则建立 A -> B 的边，权重为提及次数。
"""
import json
import os
import re

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

with conn.cursor() as cur:
    cur.execute("SELECT name, dynasty, COALESCE(bio_simp, bio_desc) FROM poet_bios WHERE COALESCE(bio_simp, bio_desc) IS NOT NULL")
    rows = cur.fetchall()

name_to_dynasty = {name: dynasty for name, dynasty, _ in rows}
# 按名字长度降序匹配，避免“李杜”先匹配“杜”
names = sorted(name_to_dynasty.keys(), key=len, reverse=True)

edges = {}
for name, _, bio in rows:
    text = bio or ""
    for other in names:
        if other == name:
            continue
        if other in text:
            cnt = text.count(other)
            key = (name, other)
            edges[key] = edges.get(key, 0) + cnt

print(f"[relations] 提取 {len(edges)} 条边")

# 只保留双向都有边的，或者单方向 weight >=2 的，减少噪音
strong_edges = []
for (src, tgt), w in edges.items():
    if w >= 2 or edges.get((tgt, src), 0) > 0:
        strong_edges.append((src, tgt, w))

print(f"[relations] 强关系 {len(strong_edges)} 条")

# 建表并写入
with conn.cursor() as cur:
    cur.execute(
        """CREATE TABLE IF NOT EXISTS poet_relations (
             source VARCHAR(64) NOT NULL,
             target VARCHAR(64) NOT NULL,
             weight INT NOT NULL DEFAULT 1,
             PRIMARY KEY (source, target)
           ) CHARACTER SET utf8mb4"""
    )
    cur.execute("TRUNCATE poet_relations")
    cur.executemany(
        "INSERT INTO poet_relations (source, target, weight) VALUES (%s, %s, %s)",
        strong_edges,
    )
conn.commit()
conn.close()
print("[OK] 写入 poet_relations 完成")
