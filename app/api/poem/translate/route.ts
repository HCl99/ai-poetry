import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { embedText } from '@/lib/embedding';
import { hybridCoarse, vectorCorpusSize } from '@/lib/vectorStore';
import { checkAiRateLimit } from '@/lib/rateLimit';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

/**
 * F2 译文/赏析：为诗词生成白话译文与鉴赏短评
 * 已有 Annotation 缓存直接返回；否则 RAG（相似诗篇+诗人小传）作上下文由 GLM 生成，结果落库复用
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'translate', 10);
  if (limited) return limited;

  const { poemId } = (await req.json()) as { poemId?: string };
  if (!poemId) return Response.json({ error: '缺少 poemId' }, { status: 400 });

  const poem = await prisma.poem.findUnique({ where: { id: poemId }, include: { annotations: true } });
  if (!poem) return Response.json({ error: '诗词不存在' }, { status: 404 });

  // 缓存命中：直接返回已生成的译文/赏析
  if (poem.annotations?.fanyi || poem.annotations?.shangxi) {
    return Response.json({
      cached: true,
      fanyi: poem.annotations.fanyi,
      shangxi: poem.annotations.shangxi,
      source: poem.annotations.source,
    });
  }

  const orig = (poem.paragraphsSimp as string[] | null) || (poem.paragraphs as string[] | null) || [];
  const origText = orig.join('\n');
  const queryText = `《${poem.title}》${poem.author}：${origText.replace(/\n/g, '')}`.slice(0, 400);

  // RAG：相似诗篇 + 诗人小传（向量不可用则降级为无上下文直出）
  let relatedCtx = '';
  let bioCtx = '';
  try {
    const queryVec = await embedText(queryText);
    const corpusSize = await vectorCorpusSize();
    if (queryVec && corpusSize > 0) {
      const coarse = await hybridCoarse(queryText, queryVec, 5, {
        excludeId: poem.id,
        filter: (m) => !(m.title === poem.title && m.author === poem.author),
      });
      const bodies = coarse.length
        ? await prisma.poem.findMany({ where: { id: { in: coarse.map((h) => h.id) } }, select: { id: true, paragraphsSimp: true, paragraphs: true } })
        : [];
      const bodyMap = new Map(bodies.map((b) => [b.id, (((b.paragraphsSimp as string[] | null) || (b.paragraphs as string[] | null) || []).join(''))]));
      relatedCtx = coarse
        .map((h) => `《${h.title}》〔${h.dynasty}〕${h.author}：${(bodyMap.get(h.id) || '').slice(0, 120)}`)
        .join('\n');
    }
  } catch (e) {
    console.error('translate RAG error:', (e as Error)?.message);
  }
  const bio = await prisma.poetBio.findFirst({ where: { name: poem.author } });
  bioCtx = bio?.bioSimp?.slice(0, 200) || bio?.bioDesc?.slice(0, 200) || '';

  const prompt = `【原诗】《${poem.title}》〔${poem.dynasty}〕${poem.author}
${origText}
${bioCtx ? `\n【诗人小传】${bioCtx}\n` : ''}${relatedCtx ? `\n【同类诗篇参考】\n${relatedCtx}\n` : ''}
请输出 JSON（不要输出其他内容）：{"fanyi": "白话译文，逐联意译、语言流畅，250字以内", "shangxi": "鉴赏短评，从意象、手法、情感三方面分析，250字以内"}`;

  try {
    const resp = await client.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是古典文学研究专家。只输出 JSON，格式 {"fanyi": "...", "shangxi": "..."}，不要输出其他内容。译文准确通顺，赏析紧扣原诗文本，不编造史实。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 900,
    });
    const raw = resp.choices?.[0]?.message?.content || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return Response.json({ error: '生成失败，请重试' }, { status: 500 });
    const parsed = JSON.parse(m[0]) as { fanyi?: string; shangxi?: string };
    const fanyi = (parsed.fanyi || '').trim().slice(0, 600);
    const shangxi = (parsed.shangxi || '').trim().slice(0, 600);
    if (!fanyi && !shangxi) return Response.json({ error: '生成失败，请重试' }, { status: 500 });

    await prisma.annotation.upsert({
      where: { poemId: poem.id },
      create: { poemId: poem.id, fanyi: fanyi || null, shangxi: shangxi || null, source: 'AI生成(GLM-4-Flash)', model: 'glm-4-flash' },
      update: { fanyi: fanyi || undefined, shangxi: shangxi || undefined, source: 'AI生成(GLM-4-Flash)', model: 'glm-4-flash' },
    });

    return Response.json({ cached: false, fanyi, shangxi, source: 'AI生成(GLM-4-Flash)' });
  } catch (e) {
    console.error('translate generate error:', (e as Error)?.message);
    return Response.json({ error: '生成失败，请稍后重试' }, { status: 500 });
  }
}
