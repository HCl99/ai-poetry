import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { SSE_HEADERS, sseEvent } from '@/lib/sse';
import { ANNOTATION_SECTIONS, parseAnnotationSections, withFallback } from '@/lib/sections';
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
    (poem.paragraphs as string[] | null)?.join('\n') ||
    '';

  const model = 'glm-4-flash';
  const t0 = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));

      try {
        /* ---- 阶段 1：识别核心意象 ---- */
        send('step', { label: '解析诗词正文', detail: `${poem.dynasty} · ${poem.author}` });
        const imageryRows = await prisma.poemImagery.findMany({
          where: { poemId },
          orderBy: { imageryChar: 'asc' },
          take: 3,
        });
        const chars = imageryRows.map((r) => r.imageryChar);
        send('step', {
          label: '识别核心意象',
          detail: chars.length ? chars.join('、') : '未命中意象库，使用全文语义',
        });

        /* ---- 阶段 2：意象共现检索 ---- */
        const relatedRows = chars.length
          ? await prisma.poemImagery.findMany({
              where: { imageryChar: { in: chars }, NOT: { poemId } },
              take: 8,
              include: {
                poem: {
                  select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true },
                },
              },
            })
          : [];
        const seen = new Set<string>();
        const related = relatedRows
          .filter((r) => !seen.has(r.poemId) && seen.add(r.poemId))
          .slice(0, 5);
        send('step', {
          label: '检索同意象诗篇',
          detail: related.length ? `命中 ${related.length} 篇参照作品` : '无共现诗篇',
        });

        /* ---- 阶段 3：诗人小传 ---- */
        const bio = await prisma.poetBio.findFirst({ where: { name: poem.author } });
        send('step', {
          label: '匹配诗人小传',
          detail: bio ? `已载入《${poem.author}》传记资料` : '暂无小传，使用通行注本',
        });

        const relatedCtx = related
          .map(
            (r) =>
              `《${r.poem.title}》〔${r.poem.dynasty}〕${r.poem.author}：${((r.poem.paragraphsSimp as string[] | null) || []).join('')}`,
          )
          .join('\n');
        const bioCtx = bio?.bioSimp?.slice(0, 260) || bio?.bioDesc?.slice(0, 260) || '';
        const existing = poem.annotations;

        /* ---- 引用来源（真实检索数据） ---- */
        const citations: Record<string, string> = {
          zici: existing ? `AI赏析库 · ${model} 生成` : '模型知识 · 通行校注本',
          diangu: related[0] ? `意象共现检索 · 《${related[0].poem.title}》` : '意象共现库',
          qinggan: bio ? `诗人小传 · 《${poem.author}》传记资料` : '诗人小传库',
          geli: '格律分析引擎',
        };
        const dimsMeta = ANNOTATION_SECTIONS.map((d) => ({
          key: d.key,
          tag: d.tag,
          citation: citations[d.key],
        }));
        const relatedMeta = related.map((r) => ({
          id: r.poem.id,
          title: r.poem.title,
          author: r.poem.author,
          dynasty: r.poem.dynasty,
        }));

        send('meta', { model, dims: dimsMeta, related: relatedMeta, hasBio: !!bio });

        /* ---- 阶段 4：大模型流式生成（按【小节】标记纯文本输出） ---- */
        const prompt = `你是一位资深古典文学研究专家。请对下面这首诗进行四维度学术注解。

【诗词】《${poem.title}》〔${poem.dynasty}〕${poem.author}
${orig}

【参考上下文（知识库检索结果）】
${bioCtx ? `诗人小传：${bioCtx}\n` : ''}${relatedCtx ? `同意象诗篇：\n${relatedCtx}\n` : ''}${existing?.fanyi ? `白话译文参考：${existing.fanyi.slice(0, 300)}\n` : ''}

请严格按以下格式输出，不要输出任何额外文字、不要 markdown 代码块、不要重复诗词原文：
【字词释义】
（解析诗中2-4个关键字词的含义与用法，150字以内）
【典故溯源】
（解析诗中典故或核心意象的历史文化源流，150字以内）
【情感分析】
（分析诗歌的情感路径与意境层次，150字以内）
【格律分析】
（判断体裁、平仄特点、押韵与对仗情况，120字以内）`;

        const resp = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: '你是古典文学研究专家，严格使用【小节名】标记分节输出，不输出任何额外内容。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.6,
          max_tokens: 1200,
          stream: true,
        });

        let full = '';
        for await (const chunk of resp) {
          const delta = chunk.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            send('delta', { text: delta });
          }
        }

        /* ---- 权威解析（流结束后） ---- */
        const sections = withFallback(full, parseAnnotationSections(full));
        const dimensions = ANNOTATION_SECTIONS.map((d) => ({
          key: d.key,
          tag: d.tag,
          content: sections[d.key],
          citation: citations[d.key],
        }));
        const latencyMs = Date.now() - t0;

        /* ---- 日志 + 学习记录 ---- */
        await prisma.annotationLog.create({
          data: {
            userQuery: `annotate:${poem.title}`,
            poemId,
            retrievedChunks: related.map((r) => r.poemId),
            answer: JSON.stringify(sections).slice(0, 5000),
            model,
            latencyMs,
          },
        });
        await prisma.history.create({
          data: {
            userId: session.user.id,
            actionType: 'annotate',
            targetId: poemId,
            title: `AI注解《${poem.title}》`,
            detail: '四维度注解 · 知识库检索与引用追溯',
          },
        });

        send('done', { latencyMs, dimensions, model });
      } catch (e: any) {
        console.error('annotation stream error', e?.message || e);
        send('error', { error: 'AI生成失败，请重试' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
