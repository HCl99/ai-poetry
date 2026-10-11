# -*- coding: utf-8 -*-
"""create_user_tables.py - 建收藏/历史/创作/笔记四张用户表"""
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

SQL = """
CREATE TABLE IF NOT EXISTS favorites (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    CHAR(36)    NOT NULL,
    poem_id    CHAR(36)    NOT NULL,
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_poem (user_id, poem_id),
    CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_fav_poem FOREIGN KEY (poem_id) REFERENCES poems(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS histories (
    id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     CHAR(36)    NOT NULL,
    action_type VARCHAR(24) NOT NULL COMMENT 'read/annotate/transfer/favorite/imagery',
    target_id   VARCHAR(64),
    title       VARCHAR(255),
    detail      VARCHAR(500),
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_hist_user (user_id, created_at),
    CONSTRAINT fk_hist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS creations (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     CHAR(36)     NOT NULL,
    style       VARCHAR(24)  NOT NULL,
    input_text  TEXT         NOT NULL,
    output_text TEXT         NOT NULL,
    model       VARCHAR(32),
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_creation_user (user_id, created_at),
    CONSTRAINT fk_creation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS notes (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    CHAR(36)    NOT NULL,
    poem_id    CHAR(36),
    title      VARCHAR(255),
    content    TEXT        NOT NULL,
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_note_user (user_id, created_at),
    CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""

def main():
    cfg = read_env()
    conn = pymysql.connect(
        host=cfg.get("MYSQL_HOST", "127.0.0.1"), port=int(cfg.get("MYSQL_PORT", "3306")),
        user=cfg.get("MYSQL_USER", "root"), password=cfg.get("MYSQL_PASSWORD", ""),
        database=cfg.get("MYSQL_DATABASE", "ai_poetry"), charset="utf8mb4", autocommit=True,
    )
    with conn.cursor() as cur:
        for stmt in [s.strip() for s in SQL.split(";") if s.strip()]:
            cur.execute(stmt)
        cur.execute("SHOW TABLES")
        tables = [r[0] for r in cur.fetchall()]
    print("[OK] tables:", tables)
    conn.close()

if __name__ == "__main__":
    main()
