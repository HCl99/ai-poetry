// 诗篇 RAG 检索：与 /api/annotation 主注解同一链路（混合检索粗排 → CrossEncoder 精排 → 意象共现兜底）
// 供 /api/compare-annot 多模型对比复用；注解主路由暂保持内联实现不改动，避免回归
import { prisma } from '@/lib/prisma';
import { embedText } from '@/lib/embedding';
import { hybridCoarse, vectorCorpusSize } from '@/lib/vectorStore';
import { rerankTopN } from '@/lib/reranker';

export interface RelatedPoem {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  body: string;
  score: number | null;
  rerankScore?: number;
}

export interface RetrieveResult {
  related: RelatedPoem[];
  useVector: boolean;
  rerankApplied: boolean;
  corpusSize: number;
  bio: { bioSimp: string | null; bioDesc: string | null } | null;
  queryText: string;
}

export async function retrieveForPoem(poem: { id: string; title: string; author: string }, orig: string): Promise<RetrieveResult> {
  const queryText = `《${poem.title}》${poem.author}：${orig.replace(/\n/g, '')}`.slice(0, 400);
  const queryVec = await embedText(queryText);
  const corpusSize = await vectorCorpusSize();
  const useVector = !!queryVec && corpusSize > 0;

  let related: RelatedPoem[] = [];
  let rerankApplied = false;

  if (useVector) {
    const coarse = await hybridCoarse(queryText, queryVec!, 20, {
      excludeId: poem.id,
      filter: (m) => !(m.title === poem.title && m.author === poem.author),
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
        related = coarse.slice(0, 5).map((h) => ({ ...h, body: bodyMap.get(h.id) || '', score: h.score }));
      }
    }
  }

  if (related.length === 0) {
    const imageryRows = await prisma.poemImagery.findMany({
      where: { poemId: poem.id },
      orderBy: { imageryChar: 'asc' },
      take: 3,
    });
    const chars = imageryRows.map((r) => r.imageryChar);
    if (chars.length) {
      const rows = await prisma.poemImagery.findMany({
        where: { imageryChar: { in: chars }, NOT: { poemId: poem.id } },
        take: 8,
        include: { poem: { select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true } } },
      });
      const seen = new Set<string>();
      related = rows
        .filter((r) => !seen.has(r.poemId) && seen.add(r.poemId))
        .slice(0, 5)
        .map((r) => ({
          id: r.poem.id, title: r.poem.title, author: r.poem.author, dynasty: r.poem.dynasty,
          body: ((r.poem.paragraphsSimp as string[] | null) || []).join(''), score: null,
        }));
    }
  }

  const bio = await prisma.poetBio.findFirst({
    where: { name: poem.author },
    select: { bioSimp: true, bioDesc: true },
  });
  return { related, useVector, rerankApplied, corpusSize, bio, queryText };
}
