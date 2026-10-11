-- AI古诗词文化探索平台 - Supabase Schema
-- 启用 pgvector 扩展用于RAG向量检索
create extension if not exists vector;

-- 诗篇主表（chinese-poetry 数据来源）
create table if not exists poems (
    id              uuid primary key,                    -- chinese-poetry 的诗UUID
    title           text not null,
    author          text not null,
    dynasty         text not null default '唐',
    paragraphs      jsonb not null,                       -- 原诗段落数组（繁体）
    paragraphs_simp jsonb,                                -- 简体段落数组
    tags            jsonb default '[]'::jsonb,             -- K12教学标签等
    source_file     text,                                 -- 来源文件路径
    created_at      timestamptz not null default now()
);
create index if not exists idx_poems_title_trgm on poems using gin (title gin_trgm_ops);
create index if not exists idx_poems_author on poems (author);
create index if not exists idx_poems_tags_gin on poems using gin (tags jsonb_path_ops);

-- 赏析表（每诗一条：译文/赏析/注释）
create table if not exists annotations (
    poem_id    uuid primary key references poems(id) on delete cascade,
    fanyi      text,
    shangxi    text,
    zhushihui  text,
    source     text not null default 'AI生成(GLM-4-Flash)',
    model      text,
    created_at timestamptz not null default now()
);

-- 诗人小传表
create table if not exists poet_bios (
    id         uuid primary key,                            -- chinese-poetry authors.tang/song 的UUID
    name       text not null,
    dynasty    text not null default '唐',
    bio_desc   text,                                       -- 文言文小传（繁体）
    bio_simp   text,                                       -- 简体小传
    created_at timestamptz not null default now()
);
create index if not exists idx_poet_bios_name on poet_bios (name);

-- 意象清单
create table if not exists imagery (
    char    text primary key,
    count   integer not null default 0
);

-- 诗-意象关联（一首诗含哪些意象+含意象的代表句）
create table if not exists poem_imagery (
    poem_id      uuid references poems(id) on delete cascade,
    imagery_char text references imagery(char),
    line_text    text,
    primary key (poem_id, imagery_char)
);
create index if not exists idx_poem_imagery_char on poem_imagery (imagery_char);

-- 意象共现边（用于意象图谱可视化）
create table if not exists imagery_cooccurrence (
    source_char text not null,
    target_char text not null,
    weight      integer not null,
    primary key (source_char, target_char)
);

-- RAG 文本切片表（含向量嵌入）
create table if not exists chunks (
    id          bigserial primary key,
    poem_id     uuid references poems(id) on delete cascade,
    chunk_type  text not null,                              -- 'original' / 'fanyi' / 'shangxi' / 'zhushihui' / 'bio'
    text        text not null,
    embedding   vector(1536),                               -- OpenAI text-embedding-3-small 维度
    created_at  timestamptz not null default now()
);
create index if not exists idx_chunks_poem_id on chunks (poem_id);
create index if not exists idx_chunks_type on chunks (chunk_type);
-- ivfflat 向量索引（RAG相似度检索）
create index if not exists idx_chunks_embedding_ivfflat
    on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 注解查询日志表（用于分析用户问题模式）
create table if not exists annotation_logs (
    id            bigserial primary key,
    user_query    text,
    poem_id       uuid,
    retrieved_chunks bigint[],
    answer        text,
    model         text,
    latency_ms    integer,
    created_at   timestamptz not null default now()
);
