# -*- coding: utf-8 -*-
"""smoke_real_embed.py - 真实诗句测速 + 有小传诗人的作品量统计"""
import json
import os
import time

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

import pymysql
import torch
from sentence_transformers import SentenceTransformer

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

cur.execute("""SELECT COUNT(*) FROM poems p
               JOIN poet_bios b ON b.name = p.author""")
print("有小传诗人的作品数:", cur.fetchone()[0])

cur.execute("SELECT title, author, paragraphs_simp FROM poems ORDER BY RAND() LIMIT 512")
rows = cur.fetchall()
texts = []
for title, author, paras in rows:
    body = "".join(json.loads(paras) if paras else [])
    texts.append(f"《{title}》{author}：{body}"[:400])
conn.close()

torch.set_num_threads(14)
model = SentenceTransformer("BAAI/bge-small-zh-v1.5", device="cpu")
# 预热
model.encode(["预热"], normalize_embeddings=True)
t0 = time.time()
vecs = model.encode(texts, batch_size=256, normalize_embeddings=True, show_progress_bar=False)
el = time.time() - t0
print(f"真实诗句 512 条: {el:.2f}s -> {512 / el:.0f} 条/s")
print(f"全量 34.4 万预估: {344338 / (512 / el) / 60:.0f} min")
