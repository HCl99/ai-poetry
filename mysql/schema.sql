-- AI古诗词文化探索平台 - MySQL Schema (MySQL 8.0+)
-- 向量字段用 LONGTEXT 存 JSON 数组（开发期应用层算cosine；部署期可迁pgvector）
-- 字符集统一 utf8mb4 支持中文+生僻字

-- 诗篇主表
CREATE TABLE IF NOT EXISTS poems (
    id              CHAR(36)     NOT NULL PRIMARY KEY,                -- chinese-poetry 的诗UUID
    title           VARCHAR(255) NOT NULL,
    author          VARCHAR(64)  NOT NULL,
    dynasty         VARCHAR(16)  NOT NULL DEFAULT '唐',
    paragraphs      JSON         NOT NULL,                              -- 原诗段落数组（繁体）
    paragraphs_simp JSON,                                               -- 简体段落数组
    tags            JSON,                                               -- K12教学标签等
    source_file     VARCHAR(255),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_poems_author (author),
    INDEX idx_poems_dynasty (dynasty),
    FULLTEXT INDEX ft_poems_title (title) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 赏析表（每诗一条：译文/赏析/注释）
CREATE TABLE IF NOT EXISTS annotations (
    poem_id     CHAR(36)     NOT NULL PRIMARY KEY,
    fanyi       MEDIUMTEXT,
    shangxi     MEDIUMTEXT,
    zhushihui   MEDIUMTEXT,
    source      VARCHAR(64)  NOT NULL DEFAULT 'AI生成(GLM-4-Flash)',
    model       VARCHAR(32),
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_annotations_poem FOREIGN KEY (poem_id) REFERENCES poems(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 诗人小传表
CREATE TABLE IF NOT EXISTS poet_bios (
    id          CHAR(36)     NOT NULL PRIMARY KEY,
    name        VARCHAR(64)  NOT NULL,
    dynasty     VARCHAR(16)  NOT NULL DEFAULT '唐',
    bio_desc    MEDIUMTEXT,                                          -- 文言文小传（繁体）
    bio_simp    MEDIUMTEXT,                                          -- 简体小传
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_poet_bios_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 意象清单
CREATE TABLE IF NOT EXISTS imagery (
    `char`  CHAR(4)    NOT NULL PRIMARY KEY,
    `count` INT        NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 诗-意象关联
CREATE TABLE IF NOT EXISTS poem_imagery (
    poem_id       CHAR(36)  NOT NULL,
    imagery_char  CHAR(4)   NOT NULL,
    line_text     VARCHAR(500),
    PRIMARY KEY (poem_id, imagery_char),
    INDEX idx_pi_char (imagery_char),
    CONSTRAINT fk_pi_poem FOREIGN KEY (poem_id) REFERENCES poems(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 意象共现边（用于意象图谱可视化）
CREATE TABLE IF NOT EXISTS imagery_cooccurrence (
    source_char CHAR(4) NOT NULL,
    target_char CHAR(4) NOT NULL,
    weight      INT     NOT NULL,
    PRIMARY KEY (source_char, target_char)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- RAG 文本切片表（embedding 存 JSON 向量数组）
CREATE TABLE IF NOT EXISTS chunks (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    poem_id     CHAR(36)     NOT NULL,
    chunk_type  VARCHAR(16)  NOT NULL,                                -- original/fanyi/shangxi/zhushihui/bio
    `text`      MEDIUMTEXT   NOT NULL,
    embedding   LONGTEXT,                                            -- JSON 数组 [0.1, 0.2, ...]
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_chunks_poem (poem_id),
    INDEX idx_chunks_type (chunk_type),
    CONSTRAINT fk_chunks_poem FOREIGN KEY (poem_id) REFERENCES poems(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 注解查询日志
CREATE TABLE IF NOT EXISTS annotation_logs (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_query      TEXT,
    poem_id         CHAR(36),
    retrieved_chunks JSON,                                            -- chunk id 数组
    answer          MEDIUMTEXT,
    model           VARCHAR(32),
    latency_ms      INT,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
