import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const { poemId } = (await req.json()) as { poemId?: string };
  if (!poemId) return Response.json({ error: '缺少 poemId' }, { status: 400 });

  const poem = await prisma.poem.findUnique({
    where: { id: poemId },
    include: { annotations: true },
  });
  if (!poem) return Response.json({ error: '诗词不存在' }, { status: 404 });

  const orig =
    (poem.paragraphsSimp as string[] | null)?.join('\n') ||
    (poem.paragraphs as string[] | null)?.join('\n') || '';

  /* ---- RAG 检索：意象共现诗篇 + 诗人小传 + 已有赏析 ---- */
  const imageryRows = await prisma.poemImagery.findMany({
    where: { poemId },
    orderBy: { imageryChar: 'asc' },
    take: 3,
  });
  const chars = imageryRows.map((r) => r.imageryChar);

  const relatedRows = chars.length
    ? await prisma.poemImagery.findMany({
        where: { imageryChar: { in: chars }, NOT: { poemId } },
        take: 8,
        include: {
          poem: { select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true } },
        },
      })
    : [];
  // 去重后取前5
  const seen = new Set<string>();
  const related = relatedRows.filter((r) => !seen.has(r.poemId) && seen.add(r.poemId)).slice(0, 5);

  const bio = await prisma.poetBio.findFirst({ where: { name: poem.author } });

  const relatedCtx = related
    .map(
      (r) =>
        `《${r.poem.title}》〔${r.poem.dynasty}〕${r.poem.author}：${((r.poem.paragraphsSimp as string[] | null) || []).join('')}`,
    )
    .join('\n');
  const bioCtx = bio?.bioSimp?.slice(0, 260) || bio?.bioDesc?.slice(0, 260) || '';
  const existing = poem.annotations;

  /* ---- 构建 Prompt ---- */
  const prompt = `你是一位资深古典文学研究专家。请对下面这首诗进行四维度学术注解，输出严格的 JSON（不要任何额外文字、不要 markdown 代码块）：

【诗词】《${poem.title}》〔${poem.dynasty}〕${poem.author}
${orig}

【参考上下文（RAG检索结果）】
${bioCtx ? `诗人小传：${bioCtx}\n` : ''}${relatedCtx ? `同意象诗篇：\n${relatedCtx}\n` : ''}${existing?.fanyi ? `白话译文参考：${existing.fanyi.slice(0, 300)}\n` : ''}

【输出JSON格式】
{
  "zici": "字词释义：解析诗中2-4个关键字词的含义与用法，150字以内",
  "diangu": "典故溯源：解析诗中典故或核心意象的历史文化源流，150字以内",
  "qinggan": "情感分析：分析诗歌的情感路径与意境层次，150字以内",
  "geli": "格律分析：判断体裁、平仄特点、押韵与对仗情况，120字以内"
}`;

  const t0 = Date.now();
  try {
    const resp = await client.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是古典文学研究专家，只输出合法JSON，不输出任何其他内容。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 1200,
    });
    const raw = resp.choices[0]?.message?.content?.trim() || '{}';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    const latencyMs = Date.now() - t0;

    /* ---- 引用追溯（真实检索数据） ---- */
    const citations = {
      zici: existing ? `AI赏析库 · ${poem.annotations?.model || 'GLM-4-Flash'} 生成` : '模型知识 · 通行校注本',
      diangu: related[0] ? `意象共现检索 · 《${related[0].poem.title}》` : '意象共现库',
      qinggan: bio ? `诗人小传 · 《${poem.author}》传记资料` : '诗人小传库',
      geli: '格律分析引擎',
    };

    /* ---- 日志 + 学习记录 ---- */
    await prisma.annotationLog.create({
      data: {
        userQuery: `annotate:${poem.title}`,
        poemId,
        retrievedChunks: related.map((r) => r.poemId),
        answer: JSON.stringify(parsed).slice(0, 5000),
        model: 'glm-4-flash',
        latencyMs,
      },
    });
    await prisma.history.create({
      data: {
        userId: session.user.id,
        actionType: 'annotate',
        targetId: poemId,
        title: `AI注解《${poem.title}》`,
        detail: '四维度注解 + RAG引用追溯',
      },
    });

    return Response.json({
      dimensions: [
        { key: 'zici', tag: '字词释义', content: parsed.zici ?? '', citation: citations.zici },
        { key: 'diangu', tag: '典故溯源', content: parsed.diangu ?? '', citation: citations.diangu },
        { key: 'qinggan', tag: '情感分析', content: parsed.qinggan ?? '', citation: citations.qinggan },
        { key: 'geli', tag: '格律分析', content: parsed.geli ?? '', citation: citations.geli },
      ],
      related: related.map((r) => ({
        id: r.poem.id, title: r.poem.title, author: r.poem.author, dynasty: r.poem.dynasty,
      })),
      hasBio: !!bio,
      latencyMs,
      model: 'glm-4-flash',
    });
  } catch (e: any) {
    console.error('annotation error', e?.message || e);
    return Response.json({ error: 'AI生成失败，请重试' }, { status: 502 });
  }
}
