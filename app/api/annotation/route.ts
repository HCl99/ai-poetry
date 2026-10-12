import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { embedText } from '@/lib/embedding';
import { hybridCoarse, vectorCorpusSize, type VectorHit } from '@/lib/vectorStore';
import { rerankTopN } from '@/lib/reranker';
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
        /* ---- 阶段 1：解析正文 + 语义向量化 ---- */
        send('step', { label: '解析诗词正文', detail: `${poem.dynasty} · ${poem.author}` });

        const queryText = `《${poem.title}》${poem.author}：${orig.replace(/\n/g, '')}`.slice(0, 400);
        const queryVec = await embedText(queryText);
        const corpusSize = await vectorCorpusSize();
        const useVector = !!queryVec && corpusSize > 0;
        send('step', {
          label: '向量化诗词语义',
          detail: useVector
            ? `BGE-small-zh · 512 维 · 向量库 ${corpusSize} 篇`
            : '向量服务不可用，降级为意象共现检索',
        });

        /* ---- 阶段 2：语义检索（向量粗排 → CrossEncoder 精排，失败回退意象共现） ---- */
        // score: 粗排余弦相似度（展示用，量纲稳定）；rerankScore: 精排相关度（排序依据）
        type RelatedPoem = { id: string; title: string; author: string; dynasty: string; body: string; score: number | null; rerankScore?: number };
        let related: RelatedPoem[] = [];
        let rerankApplied = false;

        if (useVector) {
          // 第一阶段：混合检索粗排 top20（向量 0.7 + 关键词 0.3 融合，强化人名/地名专有名词召回）
          const coarse = await hybridCoarse(queryText, queryVec!, 20, {
            excludeId: poemId,
            filter: (m) => !(m.title === poem.title && m.author === poem.author),
          });
          if (coarse.length) {
            const bodies = await prisma.poem.findMany({
              where: { id: { in: coarse.map((h) => h.id) } },
              select: { id: true, paragraphsSimp: true },
            });
            const bodyMap = new Map(bodies.map((b) => [b.id, ((b.paragraphsSimp as string[] | null) || []).join('')]));
            // 第二阶段：CrossEncoder 精排（粗排结果重排序，取 top5）
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
        send('step', {
          label: useVector ? `RAG · ${rerankApplied ? '混合检索+精排' : '混合语义检索'}` : '意象共现检索',
          detail: related.length
            ? related.map((r) => {
                if (rerankApplied) return `《${r.title}》 精排 ${r.rerankScore}`;
                return `《${r.title}》${r.score != null ? ` 相似度 ${r.score}` : ''}`;
              }).join('；')
            : '未检索到相似诗篇',
        });

        /* ---- 阶段 3：诗人小传 ---- */
        const bio = await prisma.poetBio.findFirst({ where: { name: poem.author } });
        send('step', {
          label: '匹配诗人小传',
          detail: bio ? `已载入《${poem.author}》传记资料` : '暂无小传，使用通行注本',
        });

        const relatedCtx = related
          .map((r) => `《${r.title}》〔${r.dynasty}〕${r.author}：${r.body}`)
          .join('\n');
        const bioCtx = bio?.bioSimp?.slice(0, 260) || bio?.bioDesc?.slice(0, 260) || '';
        const existing = poem.annotations;

        /* ---- 引用来源（真实检索数据） ---- */
        const citations: Record<string, string> = {
          zici: existing ? `AI赏析库 · ${model} 生成` : '模型知识 · 通行校注本',
          diangu: related[0]
            ? useVector
              ? (rerankApplied
                  ? `向量粗排+CrossEncoder 精排 · 《${related[0].title}》(精排 ${related[0].rerankScore})`
                  : `向量语义检索 · 《${related[0].title}》(相似度 ${related[0].score})`)
              : `意象共现检索 · 《${related[0].title}》`
            : useVector
              ? '向量语义检索'
              : '意象共现库',
          qinggan: bio ? `诗人小传 · 《${poem.author}》传记资料` : '诗人小传库',
          geli: '格律分析引擎',
        };
        // 引用归因：检索到的诗题集合，前端用于高亮正文中的《诗题》引用
        const retrievedTitles = related.map((r) => r.title);
        const dimsMeta = ANNOTATION_SECTIONS.map((d) => ({
          key: d.key,
          tag: d.tag,
          citation: citations[d.key],
        }));
        const relatedMeta = related.map((r) => ({
          id: r.id,
          title: r.title,
          author: r.author,
          dynasty: r.dynasty,
          score: r.score,
        }));

        send('meta', { model, dims: dimsMeta, related: relatedMeta, hasBio: !!bio });

        /* ---- 阶段 4：大模型流式生成（按【小节】标记纯文本输出） ---- */
        const prompt = `你是一位资深古典文学研究专家。请对下面这首诗进行四维度学术注解。

【诗词】《${poem.title}》〔${poem.dynasty}〕${poem.author}
${orig}

【参考上下文（知识库检索结果）】
${bioCtx ? `诗人小传：${bioCtx}\n` : ''}${relatedCtx ? `语义相似诗篇（向量检索）：\n${relatedCtx}\n` : ''}${existing?.fanyi ? `白话译文参考：${existing.fanyi.slice(0, 300)}\n` : ''}

请严格按以下格式输出，不要输出任何额外文字、不要 markdown 代码块、不要重复诗词原文：
【字词释义】
（解析诗中2-4个关键字词的含义与用法，150字以内）
【典故溯源】
（解析诗中典故或核心意象的历史文化源流，150字以内${relatedCtx ? '；引用其他诗篇作为论据时，仅允许引用上述相似诗篇列表中的诗题，以《诗题》明确标注，严禁杜撰或引用列表之外的诗篇，《》内只填诗题本身，不得填入诗句' : ''}）
【情感分析】
（分析诗歌的情感路径与意境层次，150字以内${relatedCtx ? '；如需引用其他诗篇佐证，同样仅允许引用上述相似诗篇列表中的诗题' : ''}）
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
            retrievedChunks: related.map((r) => ({ id: r.id, score: r.score })),
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
