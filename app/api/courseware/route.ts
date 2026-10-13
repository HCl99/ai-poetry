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
 * 教学课件生成：面向语文教师的轻量课堂拓展工具（PRD 用户角色「语文教师」）
 * RAG（相似诗篇+诗人小传+既有译文/赏析缓存）作上下文由 GLM 生成 Markdown 课件，前端预览+复制
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'courseware', 10);
  if (limited) return limited;

  const { poemId } = (await req.json()) as { poemId?: string };
  if (!poemId) return Response.json({ error: '缺少 poemId' }, { status: 400 });

  const poem = await prisma.poem.findUnique({ where: { id: poemId }, include: { annotations: true } });
  if (!poem) return Response.json({ error: '诗词不存在' }, { status: 404 });

  const orig = (poem.paragraphsSimp as string[] | null) || (poem.paragraphs as string[] | null) || [];
  const origText = orig.join('\n').slice(0, 600);
  const queryText = `《${poem.title}》${poem.author}：${origText.replace(/\n/g, '')}`.slice(0, 400);

  // RAG：相似诗篇（向量不可用则降级为无上下文直出）
  let relatedCtx = '';
  try {
    const queryVec = await embedText(queryText);
    const corpusSize = await vectorCorpusSize();
    if (queryVec && corpusSize > 0) {
      const coarse = await hybridCoarse(queryText, queryVec, 3, {
        excludeId: poem.id,
        filter: (m) => !(m.title === poem.title && m.author === poem.author),
      });
      const bodies = coarse.length
        ? await prisma.poem.findMany({ where: { id: { in: coarse.map((h) => h.id) } }, select: { id: true, paragraphsSimp: true, paragraphs: true } })
        : [];
      const bodyMap = new Map(bodies.map((b) => [b.id, (((b.paragraphsSimp as string[] | null) || (b.paragraphs as string[] | null) || []).join(''))]));
      relatedCtx = coarse
        .map((h) => `《${h.title}》〔${h.dynasty}〕${h.author}：${(bodyMap.get(h.id) || '').slice(0, 100)}`)
        .join('\n');
    }
  } catch (e) {
    console.error('courseware RAG error:', (e as Error)?.message);
  }
  const bio = await prisma.poetBio.findFirst({ where: { name: poem.author } });
  const bioCtx = bio?.bioSimp?.slice(0, 200) || bio?.bioDesc?.slice(0, 200) || '';

  // 既有译文/赏析缓存可作为课件素材直接采用，节省 token 且保证口径一致
  const cachedFanyi = poem.annotations?.fanyi || '';
  const cachedShangxi = poem.annotations?.shangxi || '';

  const prompt = `【原诗】《${poem.title}》〔${poem.dynasty}〕${poem.author}
${origText}
${bioCtx ? `\n【诗人小传】${bioCtx}\n` : ''}${relatedCtx ? `\n【同类诗篇参考】\n${relatedCtx}\n` : ''}${cachedFanyi ? `\n【既有白话译文（可直接采用）】${cachedFanyi.slice(0, 250)}\n` : ''}${cachedShangxi ? `\n【既有赏析（可直接采用）】${cachedShangxi.slice(0, 250)}\n` : ''}
请为初中语文课堂生成一份轻量教学课件，直接输出 Markdown 正文（不要代码块围栏），固定结构：
# 《${poem.title}》教学课件
## 一、教学目标（3 条以内）
## 二、教学重难点（各 1-2 条）
## 三、诗文诵读（原诗全文，按句分行）
## 四、字词注释（3-5 个关键字词）
## 五、译文与赏析（150 字内综合）
## 六、课堂互动（2 个提问或活动）
## 七、作业布置（2 项，含 1 项背诵任务）
要求：面向初中生，语言简明准确，内容忠实原诗、不编造史实；各节内容用 - 列表。`;

  try {
    const resp = await client.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是资深语文教师与古典文学专家，输出 Markdown 教学课件。内容忠实原诗与史实，语言面向中学生，简明实用。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 1200,
    });
    const md = (resp.choices?.[0]?.message?.content || '').trim().replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/, '').trim();
    if (md.length < 100) return Response.json({ error: '生成失败，请重试' }, { status: 500 });
    return Response.json({ markdown: md });
  } catch (e) {
    console.error('courseware generate error:', (e as Error)?.message);
    return Response.json({ error: '生成失败，请稍后重试' }, { status: 500 });
  }
}
