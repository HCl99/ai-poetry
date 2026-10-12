// 本地 BGE reranker 客户端（scripts/embed_server.py /rerank，BAAI/bge-reranker-base）
// 两级检索第二级：向量粗排 topN → CrossEncoder 精排，提升相关性精度
const RERANK_URL = process.env.EMBED_SERVER_URL || 'http://127.0.0.1:8100';
const RERANK_TIMEOUT_MS = 30000;

export interface RerankHit<T> {
  item: T;
  score: number; // sigmoid 归一化 0~1
}

/**
 * CrossEncoder 精排
 * @returns 精排后的 topN（分数降序）；服务不可用时返回 null（调用方降级为粗排顺序）
 */
export async function rerankTopN<T>(
  query: string,
  items: T[],
  textOf: (item: T) => string,
  topN = 5,
): Promise<RerankHit<T>[] | null> {
  if (items.length === 0) return [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${RERANK_URL}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.slice(0, 400), passages: items.map(textOf) }),
        signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
      });
      if (!r.ok) throw new Error(`rerank server ${r.status}`);
      const d = (await r.json()) as { scores: number[] };
      if (!Array.isArray(d.scores) || d.scores.length !== items.length) {
        throw new Error('rerank scores mismatch');
      }
      return items
        .map((item, i) => ({ item, score: Math.round(d.scores[i] * 1000) / 1000 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
    } catch (e) {
      console.error(`rerankTopN failed (attempt ${attempt + 1}):`, (e as Error)?.message);
      if (attempt === 0) await new Promise((res) => setTimeout(res, 1000));
    }
  }
  return null;
}
