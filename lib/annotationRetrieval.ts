import { prisma } from './prisma';
import { hybridCoarse } from './vectorStore';
import { rerankTopN } from './reranker';

export type RelatedPoem = {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  body: string;
  score: number | null;
  rerankScore?: number;
  /** 逐句文本（由检索后回填，用于引用定位到具体诗句） */
  lines?: string[];
  /** 与原诗字符重合度最高的句索引（0 基） */
  matchedLine?: number;
};

/**
 * 注解检索链路（主注解与多轮追问共用）：
 * 向量可用时走「混合检索粗排 top20（向量 0.7 + 关键词 0.3）→ CrossEncoder 精排 top5」；
 * reranker 不可用时降级为粗排 top5；向量不可用或未命中时降级为意象共现检索。
 */
export async function retrieveRelatedPoems(opts: {
  poemId: string;
  title: string;
  author: string;
  queryText: string;
  queryVec: number[] | null;
  useVector: boolean;
}): Promise<{ related: RelatedPoem[]; rerankApplied: boolean }> {
  const { poemId, title, author, queryText, queryVec, useVector } = opts;
  let related: RelatedPoem[] = [];
  let rerankApplied = false;

  if (useVector && queryVec) {
    const coarse = await hybridCoarse(queryText, queryVec, 20, {
      excludeId: poemId,
      filter: (m) => !(m.title === title && m.author === author),
    });
    if (coarse.length) {
      const bodies = await prisma.poem.findMany({
        where: { id: { in: coarse.map((h) => h.id) } },
        select: { id: true, paragraphsSimp: true },
      });
      const bodyMap = new Map(bodies.map((b) => [b.id, ((b.paragraphsSimp as string[] | null) || []).join('')]));
      const reranked = await rerankTopN(
        queryText,
        coarse.map((h) => ({ ...h, body: bodyMap.get(h.id) || '' })),
        (item) => `《${item.title}》${item.author}：${item.body}`,
        5,
      );
      if (reranked) {
        related = reranked.map((r) => ({ ...r.item, rerankScore: r.score }));
        rerankApplied = true;
      } else {
        // reranker 不可用时降级为粗排 top5
        related = coarse.slice(0, 5).map((h) => ({ ...h, body: bodyMap.get(h.id) || '', score: h.score }));
      }
    }
  }
  if (related.length === 0) {
    // 降级：意象共现检索
    const imageryRows = await prisma.poemImagery.findMany({
      where: { poemId },
      orderBy: { imageryChar: 'asc' },
      take: 3,
    });
    const chars = imageryRows.map((r) => r.imageryChar);
    if (chars.length) {
      const rows = await prisma.poemImagery.findMany({
        where: { imageryChar: { in: chars }, NOT: { poemId } },
        take: 8,
        include: {
          poem: { select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true } },
        },
      });
      const seen = new Set<string>();
      related = rows
        .filter((r) => !seen.has(r.poemId) && seen.add(r.poemId))
        .slice(0, 5)
        .map((r) => ({
          id: r.poem.id,
          title: r.poem.title,
          author: r.poem.author,
          dynasty: r.poem.dynasty,
          body: ((r.poem.paragraphsSimp as string[] | null) || []).join(''),
          score: null,
        }));
    }
  }
  return { related, rerankApplied };
}
