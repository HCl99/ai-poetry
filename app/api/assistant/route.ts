import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { embedText } from '@/lib/embedding';
import { hybridCoarse, vectorCorpusSize } from '@/lib/vectorStore';
import { rerankTopN } from '@/lib/reranker';
import { SSE_HEADERS, sseEvent } from '@/lib/sse';
import { checkAiRateLimit } from '@/lib/rateLimit';
import { screenInput, createOutputGuard, SAFE_REPLY } from '@/lib/content-filter';
import { getAiClient } from '@/lib/aiClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = getAiClient();

const MODEL = 'glm-4-flash';

/** F4 AI 助手：多轮自由对话，诗词知识库作为可选增强，无主题限制 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'assistant', 100);
  if (limited) return limited;

  const { message, history } = (await req.json()) as {
    message?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
  };
  const q = message?.trim().slice(0, 2000);
  if (!q) return Response.json({ error: '请输入内容' }, { status: 400 });

  const screen = screenInput(
    [q, ...(history || []).filter((m) => m.role === 'user').map((m) => m.content || '')].join('\n'),
  );
  if (!screen.ok) return Response.json({ error: screen.reason }, { status: 400 });

  const t0 = Date.now();
  // 客户端点「停止」会断开连接；若不拦截，后续 enqueue 会抛 "Controller is already closed"
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(sseEvent(event, data));
        } catch {
          closed = true;
        }
      };
      try {
        /* ---- 阶段 1：意图理解 + 检索（与 AI 注解同一检索链路） ---- */
        send('step', { label: '理解问题', detail: q, phase: 'understand' });

        const queryVec = await embedText(q);
        const corpusSize = await vectorCorpusSize();
        const useVector = !!queryVec && corpusSize > 0;

        type Hit = { id: string; title: string; author: string; dynasty: string; body: string; score: number | null; rerankScore?: number };
        let related: Hit[] = [];
        let rerankApplied = false;

        if (useVector) {
          send('step', { label: '检索诗词知识库', detail: `向量 ${corpusSize} 篇 · 混合粗排 top20`, phase: 'retrieve' });
          const coarse = await hybridCoarse(q, queryVec!, 20);
          if (coarse.length) {
            const bodies = await prisma.poem.findMany({
              where: { id: { in: coarse.map((h) => h.id) } },
              select: { id: true, paragraphsSimp: true },
            });
            const bodyMap = new Map(bodies.map((b) => [b.id, ((b.paragraphsSimp as string[] | null) || []).join('')]));
            send('step', { label: 'CrossEncoder 精排', detail: `${coarse.length} 篇候选 → top5`, phase: 'rerank' });
            const reranked = await rerankTopN(
              q,
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
        } else {
          send('step', { label: '检索诗词知识库', detail: '向量服务不可用，降级为关键词检索', phase: 'retrieve' });
          // 降级：LIKE 关键词检索
          const kw = q.replace(/[《》？！?!,，。.\s]/g, '').slice(0, 8);
          if (kw) {
            const rows = await prisma.poem.findMany({
              where: { OR: [{ title: { contains: kw } }, { author: { contains: kw } }] },
              take: 5,
              select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true },
            });
            related = rows.map((r) => ({
              id: r.id, title: r.title, author: r.author, dynasty: r.dynasty,
              body: ((r.paragraphsSimp as string[] | null) || []).join(''), score: null,
            }));
          }
        }

        // 诗人小传：问句中点名的诗人才载入（小表全量匹配）
        const poets = await prisma.poetBio.findMany({ select: { name: true, bioSimp: true, bioDesc: true } });
        const bio = poets.find((p) => q.includes(p.name));
        if (bio) send('step', { label: '匹配诗人小传', detail: `已载入《${bio.name}》传记资料`, phase: 'retrieve' });

        send('step', {
          label: '检索完成',
          phase: 'retrieved',
          detail: related.length
            ? `${rerankApplied ? '精排' : '语义'}命中 ${related.length} 篇${bio ? ' · 诗人小传已载入' : ''}`
            : '未检索到相关诗篇，将基于通用知识回答',
        });

        const relatedMeta = related.map((r) => ({ id: r.id, title: r.title, author: r.author, dynasty: r.dynasty, score: r.score }));
        send('meta', { model: MODEL, related: relatedMeta });

        /* ---- 阶段 2：多轮流式生成（引用硬约束） ---- */
        const relatedCtx = related.map((r) => `《${r.title}》〔${r.dynasty}〕${r.author}：${r.body}`).join('\n');
        const bioCtx = bio?.bioSimp?.slice(0, 260) || bio?.bioDesc?.slice(0, 260) || '';
        const histMsgs = (history || [])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-20)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: (m.content || '').slice(0, 1500) }));

        const knowledgeBlock = related.length
          ? `【知识库检索结果（仅供参考，按需引用）】\n${relatedCtx}\n${bioCtx ? `诗人小传：${bioCtx}\n` : ''}如引用知识库中的诗篇，请以《诗题》标注出处；无依据时可使用通用知识回答。`
          : '';

        const prompt = knowledgeBlock
          ? `${knowledgeBlock}\n\n【用户问题】${q}`
          : `【用户问题】${q}`;

        send('step', { label: '组织回答', detail: `依据 ${related.length} 篇检索结果 · ${histMsgs.length} 轮上下文 · ${MODEL}`, phase: 'generate' });

        const resp = await client.chat.completions.create({
          model: MODEL,
          messages: [
            { role: 'system', content: '你是一个友好、博学的 AI 助手「墨韵诗心」，由"墨韵诗心"古典诗词文化探索平台提供。你擅长古典诗词、文学艺术与传统文化，但也乐于回答任何领域的问题。回答准确、自然、有深度，篇幅根据问题复杂度灵活把握，简单问题简洁作答，复杂问题可以展开论述。如有知识库中的诗篇可参考则自然融入，无参考时基于你的知识回答即可。' },
            ...histMsgs,
            { role: 'user', content: prompt },
          ],
          temperature: 0.8,
          max_tokens: 2000,
          stream: true,
        });

        let full = '';
        const guard = createOutputGuard();
        for await (const chunk of resp) {
          const delta = chunk.choices?.[0]?.delta?.content || '';
          if (delta) {
            if (!guard.push(delta)) {
              send('error', { message: SAFE_REPLY, error: SAFE_REPLY });
              return;
            }
            full += delta;
            send('delta', { text: delta });
          }
        }

        /* ---- 引用归因：仅做日志记录，不拦截 ---- */
        const citedTitles = [...full.matchAll(/《([^《》]{1,20})》/g)].map((m) => m[1]);
        const retrievedTitles = new Set(related.map((r) => r.title));
        const citations = [...new Set(citedTitles)];
        const validCitations = citations.filter((t) => retrievedTitles.has(t));
        const invalidCitations = citations.filter((t) => !retrievedTitles.has(t));

        const latencyMs = Date.now() - t0;

        /* ---- 日志 + 学习记录 ---- */
        await prisma.annotationLog.create({
          data: {
            userQuery: `assistant:${q}`,
            retrievedChunks: related.map((r) => ({ id: r.id, score: r.score })),
            answer: full.slice(0, 3000),
            model: MODEL,
            latencyMs,
          },
        });
        await prisma.history.create({
          data: {
            userId: session.user.id,
            actionType: 'assistant',
            title: `AI助手：${q.slice(0, 30)}`,
            detail: `RAG检索 ${related.length} 篇 · 引用 ${validCitations.length} 处`,
          },
        });

        send('done', { latencyMs, model: MODEL, related: relatedMeta, citations: validCitations, invalidCitations });
      } catch (e: any) {
        console.error('assistant error', e?.message || e);
        send('error', { error: 'AI助手暂时无法回答，请重试' });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            closed = true;
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
