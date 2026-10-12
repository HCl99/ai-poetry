// 本地 BGE 向量化客户端（scripts/embed_server.py，BAAI/bge-small-zh-v1.5）
// 私有化部署的中文语义向量模型：离线可用、无第三方 API 依赖
export const EMBED_MODEL = 'bge-small-zh-v1.5';
export const EMBED_DIMS = 512;

const EMBED_URL = process.env.EMBED_SERVER_URL || 'http://127.0.0.1:8100';
// 首次冷启动需加载模型（~30s），CPU 争抢时也会变慢，故放宽超时并重试
const EMBED_TIMEOUT_MS = 30000;

async function fetchEmbed(texts: string[]): Promise<(number[] | null)[]> {
  const r = await fetch(`${EMBED_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`embed server ${r.status}`);
  const d = (await r.json()) as { vectors: number[][] };
  return d.vectors;
}

/** 单条文本向量化；失败返回 null（调用方需有降级策略） */
export async function embedText(text: string): Promise<number[] | null> {
  const vecs = await embedBatch([text]);
  return vecs[0] ?? null;
}

/** 批量文本向量化（≤64 条），失败自动重试一次 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchEmbed(texts);
    } catch (e) {
      console.error(`embedBatch failed (attempt ${attempt + 1}):`, (e as Error)?.message);
      if (attempt === 0) await new Promise((res) => setTimeout(res, 1000));
    }
  }
  return texts.map(() => null);
}
