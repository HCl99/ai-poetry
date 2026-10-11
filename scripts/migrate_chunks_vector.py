# -*- coding: utf-8 -*-
"""
migrate_chunks_vector.py - chunks 表向量检索迁移
1) poem_id 改为可空（bio 向量不属于任何诗）
2) 新增 ref_id 列（poem 向量存 poem_id，bio 向量存 poet_bios.id）
3) 外键重建 + (chunk_type, ref_id) 唯一索引做幂等键
"""
import os
import pymysql

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_env():
    cfg = {}
    with open(os.path.join(ROOT, ".env"), "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                cfg[k.strip()] = v
    return cfg


def main():
    cfg = read_env()
    conn = pymysql.connect(
        host=cfg.get("MYSQL_HOST", "127.0.0.1"),
        port=int(cfg.get("MYSQL_PORT", "3306")),
        user=cfg.get("MYSQL_USER", "root"),
        password=cfg.get("MYSQL_PASSWORD", ""),
        database=cfg.get("MYSQL_DATABASE", "ai_poetry"),
        charset="utf8mb4",
        autocommit=True,
    )
    stmts = [
        "ALTER TABLE chunks DROP FOREIGN KEY fk_chunks_poem",
        "ALTER TABLE chunks MODIFY poem_id CHAR(36) NULL",
        "ALTER TABLE chunks ADD COLUMN ref_id VARCHAR(64) NULL AFTER poem_id",
        "ALTER TABLE chunks ADD CONSTRAINT fk_chunks_poem FOREIGN KEY (poem_id) REFERENCES poems(id) ON DELETE CASCADE",
        "CREATE UNIQUE INDEX uk_chunks_ref ON chunks (chunk_type, ref_id)",
    ]
    with conn.cursor() as cur:
        for s in stmts:
            try:
                cur.execute(s)
                print(f"[OK] {s[:70]}")
            except pymysql.err.OperationalError as e:
                # 1060 列已存在 / 1061 索引已存在 / 1826 重复外键名 → 幂等跳过
                if e.args[0] in (1060, 1061, 1826):
                    print(f"[SKIP] {e.args[1]}")
                else:
                    raise
        cur.execute("DESCRIBE chunks")
        for row in cur.fetchall():
            print("  ", row[0], row[1], row[2])
    conn.close()
    print("[DONE] chunks 迁移完成")


if __name__ == "__main__":
    main()
