# -*- coding: utf-8 -*-
"""
gen_embeddings.py - 全量诗词 + 诗人小传 本地 BGE-small-zh 向量化
- 模型：BAAI/bge-small-zh-v1.5（512 维，CPU，归一化向量，余弦=点积）
- 幂等：已存在 (chunk_type, ref_id) 的跳过，可中断重跑
- 向量 round 到 4 位小数控制存储体积
"""
import json
import os
import time

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

import pymysql
import torch
from sentence_transformers import SentenceTransformer

torch.set_num_threads(14)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BATCH = 256


def read_env():
    cfg = {}
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                cfg[k.strip()] = v
    return cfg


def flush(conn, rows):
    sql = """INSERT INTO chunks (poem_id, ref_id, chunk_type, `text`, embedding)
             VALUES (%s,%s,%s,%s,%s)
             ON DUPLICATE KEY UPDATE embedding=VALUES(embedding), `text`=VALUES(`text`)"""
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    conn.commit()


def run(conn, model, chunk_type, fetch_sql, build):
    with conn.cursor() as cur:
        cur.execute("SELECT ref_id FROM chunks WHERE chunk_type=%s AND embedding IS NOT NULL", (chunk_type,))
        done = {r[0] for r in cur.fetchall()}
        cur.execute(fetch_sql)
        items = [row for row in cur.fetchall() if row[0] not in done]
    total = len(items)
    print(f"[{chunk_type}] 待向量化 {total}（已完成 {len(done)}）", flush=True)
    if total == 0:
        return
    t0 = time.time()
    for start in range(0, total, BATCH):
        batch = items[start:start + BATCH]
        refs, texts = [], []
        for row in batch:
            ref_id, poem_id, text = build(row)
            refs.append((poem_id, ref_id, chunk_type, text))
            texts.append(text)
        vecs = model.encode(texts, batch_size=BATCH, normalize_embeddings=True, show_progress_bar=False)
        rows = [
            (p, r, c, t, json.dumps([round(float(x), 4) for x in v]))
            for (p, r, c, t), v in zip(refs, vecs)
        ]
        flush(conn, rows)
        done_n = min(start + BATCH, total)
        el = time.time() - t0
        spd = done_n / el if el else 0
        eta = (total - done_n) / spd if spd else 0
        print(f"  [{chunk_type}] {done_n}/{total}  {spd:.0f}/s  ETA {eta / 60:.1f}min", flush=True)


def main():
    cfg = read_env()
    conn = pymysql.connect(
        host=cfg.get("MYSQL_HOST", "127.0.0.1"),
        port=int(cfg.get("MYSQL_PORT", "3306")),
        user=cfg.get("MYSQL_USER", "root"),
        password=cfg.get("MYSQL_PASSWORD", ""),
        database=cfg.get("MYSQL_DATABASE", "ai_poetry"),
        charset="utf8mb4",
        autocommit=False,
    )
    print("[INFO] 加载 BGE-small-zh-v1.5 ...", flush=True)
    model = SentenceTransformer("BAAI/bge-small-zh-v1.5", device="cpu")

    def build_poem(row):
        pid, title, author, paras = row
        body = "".join(json.loads(paras) if paras else [])
        text = f"《{title}》{author}：{body}"[:400].strip()
        return pid, pid, text or f"《{title}》{author}"  # 空文本会导致 tokenize 失败

    def build_bio(row):
        bid, name, bio = row
        text = f"{name}：{bio or ''}"[:600].strip()
        return bid, None, text or (name or "佚名")

    # 核心语料：有可考小传的诗人作品（17.1 万首），兼顾覆盖与质量
    run(conn, model, "poem",
        """SELECT p.id, p.title, p.author, p.paragraphs_simp FROM poems p
           JOIN poet_bios b ON b.name = p.author""",
        build_poem)
    run(conn, model, "bio",
        "SELECT id, name, bio_simp FROM poet_bios",
        build_bio)

    with conn.cursor() as cur:
        cur.execute("SELECT chunk_type, COUNT(*) FROM chunks WHERE embedding IS NOT NULL GROUP BY chunk_type")
        for ct, n in cur.fetchall():
            print(f"  [COUNT] {ct}: {n}", flush=True)
    conn.close()
    print("[DONE] 向量化完成", flush=True)


if __name__ == "__main__":
    main()
