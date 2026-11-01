// 内存向量库：从 chunks 表加载 poem 向量，余弦相似度 topK 检索
// 向量化是离线脚本持续写入的，这里带 TTL 缓存定期刷新
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface VectorHit {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  score: number; // 余弦相似度 0~1
}

interface Store {
  ids: string[];
  idIdx: Map<string, number>; // refId -> 行号，用于按 id 取向量
  mat: Float32Array; // N×D 行主序，已 L2 归一化
  dims: number;
  meta: Map<string, { title: string; author: string; dynasty: string }>;
  loadedAt: number;
}

const TTL_MS = 5 * 60 * 1000;

const CACHE_BIN = path.join(process.cwd(), 'data', 'vectors.bin');
const CACHE_META = path.join(process.cwd(), 'data', 'vectors.meta.json');

const g = globalThis as unknown as { __poemVectorStore?: Promise<Store> };

/**
 * 本地二进制缓存加载（npm run vectors:export 生成）。
 * 相比从 MySQL 拉 34.4 万行、解析约 1.5GB JSON 文本，读 700MB 二进制 + 30MB 元数据快一个量级。
 * 缓存缺失或规模与库内不一致（向量有增删）时返回 null，由调用方回退数据库加载。
 */
async function loadFromCache(): Promise<Store | null> {
  try {
    await fs.promises.access(CACHE_BIN);
    await fs.promises.access(CACHE_META);
  } catch {
    return null;
  }
  const t0 = Date.now();
  try {
    const [metaRaw, binBuf, total] = await Promise.all([
      fs.promises.readFile(CACHE_META, 'utf8'),
      fs.promises.readFile(CACHE_BIN),
      prisma.chunk.count({
        where: { chunkType: 'poem', embedding: { not: null }, refId: { not: null } },
      }),
    ]);
    const cached = JSON.parse(metaRaw) as {
      dims: number;
      count: number;
      ids: string[];
      meta: Record<string, { title: string; author: string; dynasty: string }>;
    };
    if (cached.count !== total || cached.ids.length !== total) {
      console.warn(`[vectorStore] 缓存 ${cached.count} 条与库内 ${total} 条不一致，回退数据库加载`);
      return null;
    }
    if (cached.dims <= 0 || binBuf.byteLength !== total * cached.dims * 4) {
      console.warn('[vectorStore] 缓存维度不匹配，回退数据库加载');
      return null;
    }
    let mat: Float32Array;
    if (binBuf.byteOffset % 4 === 0) {
      mat = new Float32Array(binBuf.buffer, binBuf.byteOffset, total * cached.dims);
    } else {
      const copy = new ArrayBuffer(binBuf.byteLength);
      Buffer.from(copy).set(binBuf);
      mat = new Float32Array(copy);
    }

    const idIdx = new Map<string, number>();
    cached.ids.forEach((id, i) => idIdx.set(id, i));
    const meta = new Map(Object.entries(cached.meta));
    console.log(`[vectorStore] cache loaded ${total} vectors (${cached.dims}d) in ${Date.now() - t0}ms`);
    return { ids: cached.ids, idIdx, mat, dims: cached.dims, meta, loadedAt: Date.now() };
  } catch (e) {
    console.warn('[vectorStore] 缓存读取失败，回退数据库加载：', (e as Error)?.message);
    return null;
  }
}

async function load(): Promise<Store> {
  const cached = await loadFromCache();
  if (cached) return cached;

  const t0 = Date.now();
  // 分页加载：单次 findMany 拉全量（~800MB 文本）会触发 Prisma NAPI 转换失败
  const PAGE = 5000;
  const total = await prisma.chunk.count({
    where: { chunkType: 'poem', embedding: { not: null }, refId: { not: null } },
  });
  const ids: string[] = [];
  const vecs: number[][] = [];
  let dims = 0;
  let cursor: bigint | undefined;
  for (let fetched = 0; fetched < total; ) {
    const chunks = await prisma.chunk.findMany({
      where: { chunkType: 'poem', embedding: { not: null }, refId: { not: null } },
      select: { id: true, refId: true, embedding: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (chunks.length === 0) break;
    for (const c of chunks) {
      cursor = c.id;
      try {
        const v = JSON.parse(c.embedding as string) as number[];
        if (!Array.isArray(v) || v.length === 0) continue;
        if (dims === 0) dims = v.length;
        if (v.length !== dims) continue;
        // L2 归一化，点积即余弦
        let norm = 0;
        for (const x of v) norm += x * x;
        norm = Math.sqrt(norm) || 1;
        ids.push(c.refId as string);
        vecs.push(v.map((x) => x / norm));
      } catch {
        /* 跳过坏行 */
      }
    }
    fetched += chunks.length;
  }
  const mat = new Float32Array(ids.length * dims);
  for (let i = 0; i < vecs.length; i++) mat.set(vecs[i], i * dims);

  const poems = await prisma.poem.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, author: true, dynasty: true },
  });
  const meta = new Map(poems.map((p) => [p.id, { title: p.title, author: p.author, dynasty: p.dynasty }]));

  console.log(`[vectorStore] loaded ${ids.length} vectors (${dims}d) in ${Date.now() - t0}ms`);
  const idIdx = new Map<string, number>();
  ids.forEach((id, i) => idIdx.set(id, i));
  return { ids, idIdx, mat, dims, meta, loadedAt: Date.now() };
}

async function getStore(): Promise<Store> {
  if (!g.__poemVectorStore) {
    g.__poemVectorStore = load();
    return g.__poemVectorStore;
  }
  const store = await g.__poemVectorStore;
  if (Date.now() - store.loadedAt > TTL_MS) {
    // 后台刷新：先返回旧库，避免请求阻塞；新库就绪后自动替换
    g.__poemVectorStore = load().catch(() => store);
  }
  return store;
}

/** 服务器启动预热（instrumentation.ts 调用） */
export async function warmup(): Promise<void> {
  try {
    await getStore();
  } catch (e) {
    console.warn('[vectorStore] warmup skipped:', (e as Error)?.message);
  }
}

/** 向量库中已有的向量规模（用于判断是否可用） */
export async function vectorCorpusSize(): Promise<number> {
  try {
    const s = await getStore();
    return s.ids.length;
  } catch (e) {
    console.error('[vectorStore] corpus load failed:', (e as Error)?.message);
    return 0;
  }
}

/**
 * 余弦 topK 检索
 * @param queryVec 查询向量（内部归一化）
 * @param k        返回条数
 * @param excludeId 排除的 poem id（通常是 query 自身）
 * @param filter   额外过滤条件（如限定作者）
 */
export async function topKSimilar(
  queryVec: number[],
  k = 5,
  excludeId?: string,
  filter?: (m: { title: string; author: string; dynasty: string }) => boolean,
): Promise<VectorHit[]> {
  const s = await getStore();
  if (s.ids.length === 0 || queryVec.length !== s.dims) return [];

  let norm = 0;
  for (const x of queryVec) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  const q = new Float32Array(queryVec.length);
  for (let i = 0; i < queryVec.length; i++) q[i] = queryVec[i] / norm;

  // 全量点积，取 topK（N≈17万, D=512；Node 下约百毫秒级）
  // filter 在循环内前置应用，避免过滤后候选不足
  const heap: { idx: number; score: number }[] = [];
  for (let i = 0; i < s.ids.length; i++) {
    if (filter) {
      const m = s.meta.get(s.ids[i]);
      if (!m || !filter(m)) continue;
    }
    let dot = 0;
    const off = i * s.dims;
    for (let d = 0; d < s.dims; d++) dot += s.mat[off + d] * q[d];
    if (heap.length < k) {
      heap.push({ idx: i, score: dot });
      if (heap.length === k) heap.sort((a, b) => b.score - a.score);
    } else if (dot > heap[heap.length - 1].score) {
      heap[heap.length - 1] = { idx: i, score: dot };
      // 下沉
      for (let j = heap.length - 1; j > 0 && heap[j].score > heap[j - 1].score; j--) {
        [heap[j], heap[j - 1]] = [heap[j - 1], heap[j]];
      }
    }
  }

  const hits: VectorHit[] = [];
  for (const { idx, score } of heap) {
    const id = s.ids[idx];
    if (id === excludeId) continue;
    const m = s.meta.get(id);
    if (!m) continue;
    hits.push({ id, ...m, score: Math.round(score * 1000) / 1000 });
  }
  return hits;
}

/** 从查询文本（《诗题》作者：正文…）提取诗题+作者的中文二元组，作为关键词信号 */
function keywordBigrams(queryText: string): { grams: string[]; author: string } {
  const title = queryText.match(/《([^》]{1,30})》/)?.[1] || '';
  const afterTitle = queryText.slice(queryText.indexOf('》') + 1);
  const author = afterTitle.split(/[：:]/)[0].replace(/[^一-鿿]/g, '');
  const src = (title + author).replace(/[^一-鿿]/g, '');
  const grams = new Set<string>();
  for (let i = 0; i + 2 <= src.length; i++) grams.add(src.slice(i, i + 2));
  if (author.length >= 2) grams.add(author);
  return { grams: [...grams], author };
}

/** 关键词子串评分 0~1：诗题/作者命中查询二元组计数，同作者额外加权 */
function keywordScore(m: { title: string; author: string }, grams: string[], author: string): number {
  const hay = m.title + m.author;
  let raw = 0;
  for (const g of grams) if (hay.includes(g)) raw += 1;
  if (author && m.author === author) raw += 2;
  return Math.min(1, raw / 4);
}

/**
 * 混合检索（向量 + 关键词）粗排：
 * 解决人名/地名等专有名词纯向量匹配弱的问题——
 * 向量候选扩量后与"诗题/作者含查询关键词"的库内直补候选做 0.7 向量 + 0.3 关键词加权融合。
 * 返回的 score 为融合分（0~1），可直接作为粗排结果进 CrossEncoder 精排。
 */
export async function hybridCoarse(
  queryText: string,
  queryVec: number[],
  k = 20,
  opts: {
    excludeId?: string;
    filter?: (m: { title: string; author: string; dynasty: string }) => boolean;
    vectorWeight?: number;
  } = {},
): Promise<VectorHit[]> {
  const VW = opts.vectorWeight ?? 0.7;
  const KW = 1 - VW;
  const s = await getStore();
  if (s.ids.length === 0 || queryVec.length !== s.dims) return [];

  const { grams, author } = keywordBigrams(queryText);

  // 1) 向量候选扩量
  const vecCands = await topKSimilar(queryVec, Math.max(k * 3, 60), opts.excludeId, opts.filter);

  // 2) 关键词直补：诗题/作者命中查询二元组、但向量排名可能靠后的库内诗篇（限制 24 条）
  const clauses: Prisma.PoemWhereInput[] = grams.slice(0, 8).map((g) => ({ title: { contains: g } }));
  if (author) clauses.push({ author: { equals: author } });
  const kwRows = clauses.length
    ? await prisma.poem.findMany({ where: { OR: clauses }, select: { id: true }, take: 24 })
    : [];

  // 归一化 query 向量，用于直补候选的余弦计算
  let norm = 0;
  for (const x of queryVec) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  const q = new Float32Array(queryVec.length);
  for (let i = 0; i < queryVec.length; i++) q[i] = queryVec[i] / norm;
  const cosineAt = (idx: number) => {
    let dot = 0;
    const off = idx * s.dims;
    for (let d = 0; d < s.dims; d++) dot += s.mat[off + d] * q[d];
    return dot;
  };

  // 3) 加权融合
  const fused = new Map<string, { hit: VectorHit; score: number }>();
  for (const h of vecCands) {
    const kw = keywordScore(h, grams, author);
    fused.set(h.id, { hit: h, score: VW * Math.max(0, h.score) + KW * kw });
  }
  for (const row of kwRows) {
    if (row.id === opts.excludeId || fused.has(row.id)) continue;
    const idx = s.idIdx.get(row.id);
    if (idx == null) continue; // 尚未向量化
    const m = s.meta.get(row.id);
    if (!m || (opts.filter && !opts.filter(m))) continue;
    const kw = keywordScore(m, grams, author);
    if (kw === 0) continue;
    fused.set(row.id, {
      hit: { id: row.id, ...m, score: 0 },
      score: VW * Math.max(0, cosineAt(idx)) + KW * kw,
    });
  }

  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ hit, score }) => ({ ...hit, score: Math.round(score * 1000) / 1000 }));
}
