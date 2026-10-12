import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { retrieveForPoem } from '@/lib/poemRetrieve';
import { checkCitations } from '@/lib/citationCheck';
import { SSE_HEADERS, sseEvent } from '@/lib/sse';
import { parseAnnotationSections, withFallback } from '@/lib/sections';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

/**
 * RAG 引用评测：随机抽 N 首诗，真实跑「检索 → 生成 → 引用校验」闭环，
 * 逐样本流式回报合规情况，输出累计归因率曲线与越界清单（评测日志 eval: 前缀）
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const { sampleSize } = (await req.json().catch(() => ({}))) as { sampleSize?: number };
  const n = Math.min(Math.max(sampleSize || 5, 2), 8);

  // 随机抽 N 首有标签的经典诗（句数适中）
  const where = { tags: { not: '[]' } } as const;
  const totalPoems = await prisma.poem.count({ where });
  const picks = new Map<string, { id: string; title: string; author: string; dynasty: string; paragraphsSimp: unknown; paragraphs: unknown }>();
  let guard = 0;
  while (picks.size < n && guard < n * 6) {
    guard++;
    const cand = await prisma.poem.findFirst({ where, skip: Math.floor(Math.random() * Math.max(totalPoems, 1)) });
    if (cand && !picks.has(cand.id)) picks.set(cand.id, cand);
  }
  const samples = [...picks.values()];
  if (samples.length < 2) return Response.json({ error: '抽样失败，诗篇不足' }, { status: 500 });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));
      try {
        send('meta', {
          total: samples.length,
          samples: samples.map((s, i) => ({ i, title: s.title, author: s.author, dynasty: s.dynasty })),
        });

        let cumValid = 0;
        let cumTotal = 0;
        let cumLatency = 0;
        const invalidAll: { title: string; invalid: string[] }[] = [];

        for (let i = 0; i < samples.length; i++) {
          const poem = samples[i];
          const t0 = Date.now();
          try {
            const orig =
              (poem.paragraphsSimp as string[] | null)?.join('\n') ||
              (poem.paragraphs as string[] | null)?.join('\n') || '';
            const { related, bio } = await retrieveForPoem(poem, orig);
            const relatedCtx = related.map((r) => `《${r.title}》〔${r.dynasty}〕${r.author}：${r.body}`).join('\n');
            const bioCtx = bio?.bioSimp?.slice(0, 260) || bio?.bioDesc?.slice(0, 260) || '';

            const prompt = `你是一位资深古典文学研究专家。请对下面这首诗进行四维度学术注解。

【诗词】《${poem.title}》〔${poem.dynasty}〕${poem.author}
${orig}

【参考上下文（知识库检索结果）】
${bioCtx ? `诗人小传：${bioCtx}\n` : ''}${relatedCtx ? `语义相似诗篇（向量检索）：\n${relatedCtx}\n` : ''}
请严格按以下格式输出，不要输出任何额外文字、不要 markdown 代码块、不要重复诗词原文：
【字词释义】（150字以内）
【典故溯源】（150字以内${relatedCtx ? '；引用其他诗篇仅允许引用上述相似诗篇列表中的诗题，以《诗题》标注，严禁杜撰' : ''}）
【情感分析】（150字以内）
【格律分析】（120字以内）`;

            const resp = await client.chat.completions.create({
              model: 'glm-4-flash',
              messages: [
                { role: 'system', content: '你是古典文学研究专家，严格使用【小节名】标记分节输出，不输出任何额外内容。' },
                { role: 'user', content: prompt },
              ],
              temperature: 0.6,
              max_tokens: 1000,
            });
            const full = resp.choices?.[0]?.message?.content || '';
            withFallback(full, parseAnnotationSections(full)); // 保持与主注解同一解析链路
            const cite = checkCitations(full, poem.title, related.map((r) => r.title));
            const latencyMs = Date.now() - t0;

            cumValid += cite.valid.length;
            cumTotal += cite.total;
            cumLatency += latencyMs;
            if (cite.invalid.length) invalidAll.push({ title: poem.title, invalid: [...new Set(cite.invalid)] });

            await prisma.annotationLog.create({
              data: {
                userQuery: `eval:${poem.title}`,
                poemId: poem.id,
                retrievedChunks: related.map((x) => ({ id: x.id, score: x.score })),
                answer: full.slice(0, 4000),
                model: 'glm-4-flash',
                latencyMs,
              },
            });

            send('sample', {
              i, title: poem.title, latencyMs, chars: full.length,
              cites: cite.total, valid: cite.valid.length,
              invalid: [...new Set(cite.invalid)],
              cumRate: cumTotal ? +(cumValid / cumTotal * 100).toFixed(1) : null,
            });
          } catch (e: any) {
            send('sample', { i, title: poem.title, error: e?.message || '评测失败', cites: 0, valid: 0, invalid: [], cumRate: cumTotal ? +(cumValid / cumTotal * 100).toFixed(1) : null });
          }
        }

        send('done', {
          samples: samples.length,
          totalCites: cumTotal,
          validCites: cumValid,
          rate: cumTotal ? +(cumValid / cumTotal * 100).toFixed(1) : null,
          avgLatencyMs: Math.round(cumLatency / samples.length),
          invalid: invalidAll,
        });
      } catch (e: any) {
        console.error('rag-eval stream error', e?.message || e);
        send('error', { error: '评测运行失败，请重试' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
