import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { retrieveForPoem } from '@/lib/poemRetrieve';
import { checkCitations } from '@/lib/citationCheck';
import { SSE_HEADERS, sseEvent } from '@/lib/sse';
import { checkAiRateLimit } from '@/lib/rateLimit';
import { parseAnnotationSections, withFallback } from '@/lib/sections';
import { getAiClient } from '@/lib/aiClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const client = getAiClient();

/** 对比双模型：快速对话 vs 深度推理 */
const MODELS = [
  { key: 'A', model: 'glm-4-flash', label: 'GLM-4-Flash · 快速对话', maxTokens: 1200 },
  { key: 'B', model: 'glm-z1-flash', label: 'GLM-Z1-Flash · 深度推理', maxTokens: 2000 },
] as const;

/** 推理模型思维链剔除 */
function stripThink(s: string): string {
  return s.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'compare-annot', 5);
  if (limited) return limited;

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

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));
      try {
        /* ---- 共享检索：两模型使用完全相同的上下文，保证对比公平 ---- */
        send('step', { label: '解析诗词正文', detail: `${poem.dynasty} · ${poem.author}` });
        const { related, useVector, rerankApplied, bio } = await retrieveForPoem(poem, orig);
        send('step', {
          label: useVector ? `RAG · ${rerankApplied ? '混合检索+精排' : '混合语义检索'}` : '意象共现检索',
          detail: related.length ? related.map((r) => `《${r.title}》`).join('；') : '未检索到相似诗篇',
        });

        const relatedCtx = related.map((r) => `《${r.title}》〔${r.dynasty}〕${r.author}：${r.body}`).join('\n');
        const bioCtx = bio?.bioSimp?.slice(0, 260) || bio?.bioDesc?.slice(0, 260) || '';
        const retrievedTitles = related.map((r) => r.title);
        const relatedMeta = related.map((r) => ({ id: r.id, title: r.title, author: r.author, dynasty: r.dynasty, score: r.score }));
        send('meta', {
          title: poem.title, author: poem.author, dynasty: poem.dynasty,
          related: relatedMeta, hasBio: !!bio,
          models: MODELS.map((m) => ({ key: m.key, model: m.model, label: m.label })),
        });

        const prompt = `你是一位资深古典文学研究专家。请对下面这首诗进行四维度学术注解。

【诗词】《${poem.title}》〔${poem.dynasty}〕${poem.author}
${orig}

【参考上下文（知识库检索结果）】
${bioCtx ? `诗人小传：${bioCtx}\n` : ''}${relatedCtx ? `语义相似诗篇（向量检索）：\n${relatedCtx}\n` : ''}${poem.annotations?.fanyi ? `白话译文参考：${poem.annotations.fanyi.slice(0, 300)}\n` : ''}
请严格按以下格式输出，不要输出任何额外文字、不要 markdown 代码块、不要重复诗词原文：
【字词释义】
（解析诗中2-4个关键字词的含义与用法，150字以内）
【典故溯源】
（解析诗中典故或核心意象的历史文化源流，150字以内${relatedCtx ? '；引用其他诗篇作为论据时，仅允许引用上述相似诗篇列表中的诗题，以《诗题》明确标注，严禁杜撰或引用列表之外的诗篇，《》内只填诗题本身，不得填入诗句' : ''}）
【情感分析】
（分析诗歌的情感路径与意境层次，150字以内${relatedCtx ? '；如需引用其他诗篇佐证，同样仅允许引用上述相似诗篇列表中的诗题' : ''}）
【格律分析】
（判断体裁、平仄特点、押韵与对仗情况，120字以内）`;

        /* ---- 双模型并行流式生成 ---- */
        send('step', { label: '双模型并行生成', detail: MODELS.map((m) => m.label).join(' vs ') });
        const runOne = async (cfg: (typeof MODELS)[number]) => {
          const t0 = Date.now();
          const resp = await client.chat.completions.create({
            model: cfg.model,
            messages: [
              { role: 'system', content: '你是古典文学研究专家，严格使用【小节名】标记分节输出，不输出任何额外内容。' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.6,
            max_tokens: cfg.maxTokens,
            stream: true,
          });
          let raw = '';
          for await (const chunk of resp) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              raw += delta;
              send(`delta${cfg.key}`, { text: delta });
            }
          }
          const latencyMs = Date.now() - t0;
          const full = stripThink(raw);
          const sections = withFallback(full, parseAnnotationSections(full));
          const cite = checkCitations(full, poem.title, retrievedTitles);
          send(`done${cfg.key}`, { model: cfg.model, latencyMs });
          return { key: cfg.key, model: cfg.model, label: cfg.label, latencyMs, chars: full.length, sections, cite, full: full.slice(0, 4000) };
        };

        const results = await Promise.all(MODELS.map((m) => runOne(m).catch((e) => ({
          key: m.key, model: m.model, label: m.label, latencyMs: 0, chars: 0,
          sections: null, cite: { total: 0, valid: [], invalid: [] }, full: '', error: e?.message || '生成失败',
        }))));

        /* ---- 日志：两模型各记一条，compare: 前缀不污染学习路径 ---- */
        for (const r of results) {
          if ('error' in r) continue;
          await prisma.annotationLog.create({
            data: {
              userQuery: `compare:${poem.title}:${r.model}`,
              poemId,
              retrievedChunks: related.map((x) => ({ id: x.id, score: x.score })),
              answer: r.full,
              model: r.model,
              latencyMs: r.latencyMs,
            },
          });
        }

        send('done', {
          a: results.find((r) => r.key === 'A'),
          b: results.find((r) => r.key === 'B'),
        });
      } catch (e: any) {
        console.error('compare-annot stream error', e?.message || e);
        send('error', { error: '对比生成失败，请重试' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
