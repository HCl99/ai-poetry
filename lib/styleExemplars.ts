import { prisma } from './prisma';
import { embedText } from './embedding';
import { topKSimilar } from './vectorStore';
import { rerankTopN } from './reranker';
import { toSentences, shapeOf } from './poemShape';
import { CIPAI_RE, type StyleDef } from './transferStyles';
import type { Exemplar } from './transferPrompt';

/**
 * RAG：为风格迁移检索该风格诗人的语义相近范例。
 * 向量粗排（k=300，语料按「两句一行」存储，同句式作品占比不高，k 过小会漏掉）
 * → CrossEncoder 精排 top3；只保留「句式与目标体裁完全一致」的原作，
 * 这是「风格 ↔ 体裁」对上号的关键。
 */
export async function retrieveStyleExemplars(
  text: string,
  s: StyleDef,
): Promise<{ exemplars: Exemplar[]; rerankApplied: boolean }> {
  const queryVec = await embedText(text);
  if (!queryVec) return { exemplars: [], rerankApplied: false };

  // 目标句式指纹（如七律 "7,7,7,7,7,7,7,7"、定风波 "7,7,7,2,7,7,2,7,7,2,7"）：
  // 只有「句式与目标完全一致」的原作才可作为范例，避免模型照抄到错体裁的句式。
  const targetShape = s.shape.join(',');
  // 词风：优先取该作者**同一词牌**的原作范例（库中确有苏轼《定风波》、李清照《如梦令》）。
  const ciFilter = (t: string | undefined) =>
    s.cipai ? (t || '').includes(s.cipai) : CIPAI_RE.test(t || '');

  let coarse = await topKSimilar(
    queryVec,
    300,
    undefined,
    (m) => m.author === s.author && (s.genre === '诗' || ciFilter(m.title)),
  );
  if (!coarse.length && s.genre === '词') {
    coarse = await topKSimilar(
      queryVec,
      300,
      undefined,
      (m) => m.author === s.author && CIPAI_RE.test(m.title || ''),
    );
  }
  if (!coarse.length) return { exemplars: [], rerankApplied: false };

  const rows = await prisma.poem.findMany({
    where: { id: { in: coarse.map((h) => h.id) } },
    select: { id: true, paragraphsSimp: true, paragraphs: true },
  });
  const infoMap = new Map(
    rows.map((r) => {
      const lines = ((r.paragraphsSimp as string[] | null) || (r.paragraphs as string[] | null) || []) as string[];
      return [r.id, toSentences(lines)];
    }),
  );
  let cands = coarse.map((h) => ({
    title: h.title,
    sents: infoMap.get(h.id) || [],
    score: h.score,
  }));
  // 只保留句式与目标体裁完全一致者——这是「风格 ↔ 体裁」对上号的关键
  const exact = cands.filter((c) => c.sents.length && shapeOf(c.sents) === targetShape);
  if (exact.length) cands = exact;
  const rankedInput = cands.map((c) => ({ ...c, body: c.sents.join('') }));
  const reranked = await rerankTopN(
    text,
    rankedInput,
    (item) => `《${item.title}》：${item.body}`,
    3,
  );
  if (reranked) {
    return {
      exemplars: reranked.map((r) => ({ title: r.item.title, sents: r.item.sents, score: r.item.score, rerankScore: r.score })),
      rerankApplied: true,
    };
  }
  return {
    exemplars: cands.slice(0, 3).map((c) => ({ title: c.title, sents: c.sents, score: c.score })),
    rerankApplied: false,
  };
}
