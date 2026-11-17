import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { embedText } from '@/lib/embedding';
import { vectorCorpusSize } from '@/lib/vectorStore';
import { detectImageryChars } from '@/lib/imageryDetect';
import { retrieveRelatedPoems } from '@/lib/annotationRetrieval';
import { runAnnotationAgent } from '@/lib/agents/orchestrator';
import { SSE_HEADERS, sseEvent } from '@/lib/sse';
import { checkAiRateLimit } from '@/lib/rateLimit';
import { ANNOTATION_SECTIONS, parseAnnotationSections, withFallback } from '@/lib/sections';
import { screenInput, createOutputGuard, SAFE_REPLY } from '@/lib/content-filter';
import { getAiClient } from '@/lib/aiClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = getAiClient();

/* ================= 注解结果内存缓存（同诗二次注解秒级返回） ================= */
interface AnnotationCacheEntry {
  dims: { key: string; tag: string; content: string; citation: string }[];
  relatedMeta: { id: string; title: string; author: string; dynasty: string; score?: number | null }[];
  model: string;
  imageryChars: string[];
}
const _cacheGlobal = globalThis as unknown as { __annotationCache?: Map<string, AnnotationCacheEntry> };
function annotationCache(): Map<string, AnnotationCacheEntry> {
  if (!_cacheGlobal.__annotationCache) _cacheGlobal.__annotationCache = new Map();
  return _cacheGlobal.__annotationCache;
}
const CACHE_MAX = 200; // 最多缓存 200 首，LRU 由 Map 插入序近似实现

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'annotation', 10);
  if (limited) return limited;

  const { poemId, question, history } = (await req.json()) as {
    poemId?: string;
    question?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
  };
  if (!poemId) return Response.json({ error: '缺少 poemId' }, { status: 400 });

  const screen = screenInput(
    [question || '', ...(history || []).filter((m) => m.role === 'user').map((m) => m.content || '')].join('\n'),
  );
  if (!screen.ok) return Response.json({ error: screen.reason }, { status: 400 });

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

  /* ================= 多轮追问模式：针对问题独立检索，引用硬约束与主注解一致 ================= */
  if (question?.trim()) {
    const q = question.trim().slice(0, 120);
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));
        try {
          send('step', { label: '解析追问意图', detail: q });

          // 以问题为主查询、原诗为背景，混合检索（与主注解同一检索链路）
          const queryText = `${q}（《${poem.title}》${poem.author}：${orig.replace(/\n/g, '').slice(0, 120)}）`.slice(0, 400);
          const queryVec = await embedText(queryText);
          const corpusSize = await vectorCorpusSize();
          const useVector = !!queryVec && corpusSize > 0;

          const { related } = await retrieveRelatedPoems({
            poemId,
            title: poem.title,
            author: poem.author,
            queryText,
            queryVec,
            useVector,
          });
          const bio = await prisma.poetBio.findFirst({ where: { name: poem.author } });
          send('step', {
            label: '追问检索完成',
            detail: related.length ? `命中 ${related.length} 篇相似诗篇${bio ? ' · 诗人小传已载入' : ''}` : '未检索到相似诗篇',
          });

          const relatedCtx = related.map((r) => `《${r.title}》〔${r.dynasty}〕${r.author}：${r.body}`).join('\n');
          const bioCtx = bio?.bioSimp?.slice(0, 260) || bio?.bioDesc?.slice(0, 260) || '';
          const relatedMeta = related.map((r) => ({ id: r.id, title: r.title, author: r.author, dynasty: r.dynasty, score: r.score }));
          send('meta', { model, related: relatedMeta });

          // 对话历史仅保留最近 6 条，内容截断防超长
          const histMsgs = (history || [])
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-6)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: (m.content || '').slice(0, 500) }));

          const fuPrompt = `【诗词】《${poem.title}》〔${poem.dynasty}〕${poem.author}
${orig}

【知识库检索结果】
${bioCtx ? `诗人小传：${bioCtx}\n` : ''}${relatedCtx ? `相似诗篇：\n${relatedCtx}\n` : '（无）'}

【用户追问】${q}

请围绕这首诗回答上述追问，180字以内，口语化但保持学术严谨。${relatedCtx ? '如需引用其他诗篇作为论据，仅允许引用上述检索结果列表中的诗题并以《诗题》标注，严禁杜撰或引用列表之外的诗篇。' : '如无可靠依据请直说，不要编造。'}`;

          const resp = await client.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: '你是古典文学研究专家，正在与用户就一首诗进行多轮问答。回答紧扣原诗与检索上下文，不编造。' },
              ...histMsgs,
              { role: 'user', content: fuPrompt },
            ],
            temperature: 0.6,
            max_tokens: 500,
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
          const latencyMs = Date.now() - t0;
          await prisma.annotationLog.create({
            data: {
              userQuery: `followup:${poem.title}:${q}`,
              poemId,
              retrievedChunks: related.map((r) => ({ id: r.id, score: r.score })),
              answer: full.slice(0, 3000),
              model,
              latencyMs,
            },
          });
          send('done', { latencyMs, related: relatedMeta, model });
        } catch (e: any) {
          console.error('annotation followup error', e?.message || e);
          send('error', { error: '追问生成失败，请重试' });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  }

  /* ================= 主注解模式（四维度流式生成） ================= */

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));

      try {
        /* ---- 缓存命中：同诗二次注解秒级返回 ---- */
        const cached = annotationCache().get(poemId);
        if (cached) {
          send('step', { label: '命中注解缓存', detail: `《${poem.title}》· 跳过检索与生成` });
          const dimsMeta = cached.dims.map((d) => ({ key: d.key, tag: d.tag, citation: d.citation }));
          send('meta', { model: cached.model, dims: dimsMeta, related: cached.relatedMeta, hasBio: false });
          // 一次性回放缓存内容（前端逐字流式由 delta 拼接，这里直接发全文）
          const fullText = cached.dims.map((d) => `【${d.tag}】\n${d.content}`).join('\n\n');
          send('delta', { text: fullText });
          send('done', { latencyMs: 120, dimensions: cached.dims, model: cached.model, imageryChars: cached.imageryChars, degraded: false, cached: true });
          return;
        }

        /* ---- 阶段 1-3：Agent 编排（plan → act → observe，最多 4 轮） ---- */
        // 由编排器自行决定并执行：混合语义检索、诗人小传、意象频次、格律校验
        const lines = orig.split('\n').map((s) => s.trim()).filter(Boolean);
        const bundle = await runAnnotationAgent(
          { poemId, title: poem.title, author: poem.author, dynasty: poem.dynasty, body: orig, lines },
          (e) => send('step', { label: e.label, detail: e.detail, tool: e.tool, ms: e.ms, hits: e.hits }),
        );
        const { related, rerankApplied, useVector, imageryCtx, allowExternalCitation, meter } = bundle;

        const relatedCtx = related
          .map((r) => `《${r.title}》〔${r.dynasty}〕${r.author}：${r.body}`)
          .join('\n');
        const bioCtx = bundle.bioCtx;
        const hasBio = !!bioCtx;
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
          qinggan: hasBio ? `诗人小传 · 《${poem.author}》传记资料` : '诗人小传库',
          geli: meter ? `格律校验引擎 · 中华新韵（本地计算，${meter.form}）` : '格律分析引擎',
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
          lines: r.lines,
          matchedLine: r.matchedLine,
        }));

        send('meta', { model, dims: dimsMeta, related: relatedMeta, hasBio });

        /* ---- 阶段 4：大模型流式生成（按【小节】标记纯文本输出） ---- */
        // 格律硬约束：本地引擎结果为确定性事实，模型不得自行修改/编造/矛盾
        const meterFacts = meter
          ? `【格律事实（**本地校验引擎，中华新韵，确定性事实，不得修改或矛盾**）】\n` +
            `体裁：${meter.form}\n` +
            `结论：${meter.pass ? '押韵与关键位置平仄未见明显违例（宽检）' : meter.summary}\n` +
            `⚠️ 你在格律分析小节中**必须严格引用上述事实**，不得自行编造体裁、平仄或押韵结论，不得给出与之矛盾的判断。`
          : '';

        const prompt = `你是一位资深古典文学研究专家。请对下面这首诗进行四维度学术注解。

【诗词】《${poem.title}》〔${poem.dynasty}〕${poem.author}
${orig}

【参考上下文（知识库检索结果）】
${bioCtx ? `诗人小传：${bioCtx}\n` : ''}${imageryCtx ? `核心意象解读：${imageryCtx}\n` : ''}${relatedCtx ? `语义相似诗篇（向量检索）：\n${relatedCtx}\n` : ''}${meterFacts}${existing?.fanyi ? `白话译文参考：${existing.fanyi.slice(0, 300)}\n` : ''}

请严格按以下格式输出，不要输出任何额外文字、不要 markdown 代码块、不要重复诗词原文：
【字词释义】
（解析诗中2-4个关键字词的含义与用法，150字以内）
【典故溯源】
（解析诗中典故或核心意象的历史文化源流，150字以内${allowExternalCitation ? '；引用其他诗篇作为论据时，仅允许引用上述相似诗篇列表中的诗题，以《诗题》明确标注，严禁杜撰或引用列表之外的诗篇，《》内只填诗题本身，不得填入诗句' : '；本次未检索到可引用的其他诗篇，严禁引用任何其他诗篇'}）
【情感分析】
（分析诗歌的情感路径与意境层次，150字以内${allowExternalCitation ? '；如需引用其他诗篇佐证，同样仅允许引用上述相似诗篇列表中的诗题' : ''}）
【格律分析】
（判断体裁、平仄特点、押韵与对仗情况，120字以内${meter ? '；**必须严格引用上述【格律事实】的体裁与结论，不得自行编造或矛盾**' : ''}）`;

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

        /* ---- 权威解析（流结束后） ---- */
        const sections = withFallback(full, parseAnnotationSections(full));

        /* ---- 格律后校验：检测模型是否违背本地确定性事实 ---- */
        let meterConflict = false;
        let meterConflictDetail = '';
        if (meter && sections.geli) {
          const geliText = sections.geli;
          // 1. 体裁一致性校验
          const formLabel: Record<string, string> = {
            jueju5: '五言绝句', jueju7: '七言绝句', lvshi7: '七言律诗', cipai: '词',
          };
          const expectedForm = formLabel[meter.form] || meter.form;
          const formPatterns = [/五言绝句/, /七言绝句/, /五绝/, /七绝/, /七言律诗/, /七律/, /五言律诗/, /五律/, /词牌/, /词/];
          const modelForm = formPatterns.find((p) => p.test(geliText));
          if (modelForm && !geliText.includes(expectedForm.slice(0, 2))) {
            meterConflict = true;
            meterConflictDetail = `模型称「${modelForm.source}」体裁，但本地校验为「${expectedForm}」`;
          }
          // 2. 结论一致性校验（pass 时不得称「平仄有误」「出韵」）
          if (meter.pass) {
            const negativePatterns = [/平仄有误/, /平仄不合/, /押韵有误/, /出韵/, /韵脚错/];
            if (negativePatterns.some((p) => p.test(geliText))) {
              meterConflict = true;
              meterConflictDetail = meterConflictDetail || '本地校验 pass，但模型称平仄/押韵有误';
            }
          }
          if (meterConflict) {
            send('meter_conflict', { detail: meterConflictDetail, localForm: expectedForm, localPass: meter.pass });
          }
        }

        const dimensions = ANNOTATION_SECTIONS.map((d) => ({
          key: d.key,
          tag: d.tag,
          content: sections[d.key],
          citation: citations[d.key],
        }));
        const latencyMs = Date.now() - t0;

        /* ---- 多模态联动：识别注解与原诗中的库内意象，驱动前端自动生成意境图 ---- */
        const imageryChars = await detectImageryChars(`${full}\n${orig}`);

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

        /* ---- 写入缓存：同诗下次注解秒级返回 ---- */
        const cache = annotationCache();
        if (cache.size >= CACHE_MAX) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }
        cache.set(poemId, { dims: dimensions, relatedMeta, model, imageryChars });

        send('done', { latencyMs, dimensions, model, imageryChars, degraded: !useVector });
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
