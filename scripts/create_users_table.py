# -*- coding: utf-8 -*-
"""
create_users_table.py - 在 MySQL 中创建 users 表（鉴权用）
"""
import os
import pymysql

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read_env():
    env_path = os.path.join(ROOT, ".env")
    cfg = {}
    with open(env_path, "r", encoding="utf-8") as f:
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
    sql = """
    CREATE TABLE IF NOT EXISTS users (
        id            CHAR(36)     NOT NULL PRIMARY KEY,
        email         VARCHAR(255) NOT NULL UNIQUE,
        name          VARCHAR(64),
        password_hash VARCHAR(255) NOT NULL,
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        cur.execute("SHOW TABLES LIKE 'users'")
        result = cur.fetchone()
        if result:
            print("[OK] users 表已创建/已存在")
        else:
            print("[FAIL] users 表创建失败")
    conn.close()

if __name__ == "__main__":
    main()
