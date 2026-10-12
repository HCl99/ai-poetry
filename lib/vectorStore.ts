// 内存向量库：从 chunks 表加载 poem 向量，余弦相似度 topK 检索
// 向量化是离线脚本持续写入的，这里带 TTL 缓存定期刷新
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
  mat: Float32Array; // N×D 行主序，已 L2 归一化
  dims: number;
  meta: Map<string, { title: string; author: string; dynasty: string }>;
  loadedAt: number;
}

const TTL_MS = 5 * 60 * 1000;

const g = globalThis as unknown as { __poemVectorStore?: Promise<Store> };

async function load(): Promise<Store> {
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
  return { ids, mat, dims, meta, loadedAt: Date.now() };
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
