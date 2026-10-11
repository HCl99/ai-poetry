// 本地 BGE 向量化客户端（scripts/embed_server.py，BAAI/bge-small-zh-v1.5）
// 私有化部署的中文语义向量模型：离线可用、无第三方 API 依赖
export const EMBED_MODEL = 'bge-small-zh-v1.5';
export const EMBED_DIMS = 512;

const EMBED_URL = process.env.EMBED_SERVER_URL || 'http://127.0.0.1:8100';

/** 单条文本向量化；失败返回 null（调用方需有降级策略） */
export async function embedText(text: string): Promise<number[] | null> {
  const vecs = await embedBatch([text]);
  return vecs[0] ?? null;
}

/** 批量文本向量化（≤64 条） */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  try {
    const r = await fetch(`${EMBED_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`embed server ${r.status}`);
    const d = (await r.json()) as { vectors: number[][] };
    return d.vectors;
  } catch (e) {
    console.error('embedBatch failed:', (e as Error)?.message);
    return texts.map(() => null);
  }
}
