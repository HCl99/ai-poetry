import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAiClient } from '@/lib/aiClient';
import { sseEvent, SSE_HEADERS } from '@/lib/sse';
import { checkAiRateLimit } from '@/lib/rateLimit';
import { screenInput, createOutputGuard, SAFE_REPLY } from '@/lib/content-filter';
import { checkMeter, summarizeMeter, meterFormFor, type MeterReport } from '@/lib/meter';
import { STYLES } from '@/lib/transferStyles';
import { toSentences, shapeOf, normalizePoem } from '@/lib/poemShape';
import { retrieveStyleExemplars } from '@/lib/styleExemplars';
import { checkPoemContent, rewriteReason, contentIssueLabel } from '@/lib/transferCheck';
import {
  buildTransferPrompt,
  buildRewriteSuffix,
  poemBodySentences,
  stripCodeFence,
  type Exemplar,
} from '@/lib/transferPrompt';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  const limited = checkAiRateLimit(session?.user?.id || 'anon', 'transfer', 6);
  if (limited) return limited;
  const { text, style } = (await req.json()) as { text?: string; style?: string };

  // 开流前的参数校验仍返回普通 JSON 错误，便于前端直接读取
  if (!text?.trim()) return Response.json({ error: '请输入现代文内容' }, { status: 400 });
  // 只有「月亮」这类两三个字时，模型没有可提炼的情境，只能靠臆造凑句
  if (text.trim().length < 6) {
    return Response.json(
      { error: '内容太短，请至少写 6 个字：描述一个场景或心情，例如「深夜独坐窗前，看见月亮想起故乡」' },
      { status: 400 },
    );
  }
  if (!style || !STYLES[style]) return Response.json({ error: '请选择风格' }, { status: 400 });

  const screen = screenInput(text);
  if (!screen.ok) return Response.json({ error: screen.reason }, { status: 400 });

  const s = STYLES[style];
  // glm-4.5-flash 同属免费档，但中文创作质量明显好于 4-flash（不再整句搬苏轼成句）
  const model = 'glm-4.5-flash';
  const t0 = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));
      try {
        /* ---- RAG：向量粗排 → CrossEncoder 精排，检索该风格诗人的语义相近范例 ---- */
        // score: 粗排余弦（展示）；rerankScore: 精排相关度（排序依据）
        const { exemplars, rerankApplied } = await retrieveStyleExemplars(text.trim(), s);
        send('step', {
          label: rerankApplied ? 'RAG · 风格范例检索（向量+精排）' : 'RAG · 风格范例检索',
          detail: exemplars.length
            ? exemplars.map((e) => `《${e.title}》 ${rerankApplied ? `精排 ${e.rerankScore}` : `相似度 ${e.score}`}`).join('；')
            : '未命中范例，使用模型内知识',
        });

        const prompt = buildTransferPrompt(text, s, exemplars as Exemplar[]);
        send('meta', { style: s.name, form: s.form, genre: s.genre, model, exemplars: exemplars.map((e) => ({ title: e.title, score: e.score })) });

        // 生成 + 体裁校验：模型（glm-4-flash）句数/句式不稳定，若与体裁要求不符则重写，
        // 确保「风格 ↔ 体裁」对得上号（七绝 4 句 / 五绝 4 句 / 七律 8 句 / 定风波 11 句 / 浣溪沙 6 句）。
        const SYS = '你是精通古典诗词格律的AI诗人。必须严格按指定体裁的句数、每句字数与押韵规则创作，只输出诗词正文，不输出任何解释。';
        const targetShape = s.shape.join(',');
        // 格律校验形式：诗按句数/句长区分（五绝/七绝/七律），词走 cipai 押韵分支
        const meterForm = meterFormFor(s.shape, s.genre);

        let poem = '';
        let meterReport: MeterReport | null = null;
        // 保留「最合规」的一稿：4 轮里后一稿可能句数对但韵脚/内容更差，不能无条件用最后一版
        // rank 越小越好：0 格律全过 / 1 句数对格律未过 / 2 内容不实 / 3 句数不符
        let best: { rank: number; poem: string; report: MeterReport | null } = { rank: 9, poem: '', report: null };
        const guard = createOutputGuard();
        // 上一轮未通过原因（体裁/格律），注入下一轮重写 prompt；首轮为空
        let retryReason = '';
        for (let attempt = 1; attempt <= 4; attempt++) {
          const streamThis = attempt === 1; // 首轮流式（即时反馈），校验不过的重写走非流式
          // 重写提示**不再回喂「上一次输出」**：实测 flash 看到旧稿会在其后原样续写/复读，
          // 反而越写越长；只告知失败原因并重申句式，让它独立重写。
          const user = attempt === 1 ? prompt : `${prompt}\n\n【重写要求】${buildRewriteSuffix(s, retryReason)}`;
          const resp: any = await getAiClient().chat.completions.create({
            model,
            messages: [
              { role: 'system', content: SYS },
              { role: 'user', content: user },
            ],
            // 温度错档：词用偏低但非极低的温度（0.2 的贪心解码易陷入复读循环），逐轮变换以跳出局部死循环
            temperature: (s.genre === '词' ? [0.5, 0.7, 0.4, 0.8] : [0.75, 0.6, 0.9, 0.7])[attempt - 1] ?? 0.7,
            max_tokens: 300,
            stream: streamThis,
            // glm-4.5-flash 默认开启深度思考，单轮约 50s，叠加 4 轮重写会超时；关掉思考换速度
            thinking: { type: 'disabled' },
          } as any);
          let full = '';
          if (streamThis) {
            let blocked = false;
            for await (const chunk of resp as AsyncIterable<any>) {
              const d = chunk.choices?.[0]?.delta?.content || '';
              if (d) {
                if (!guard.push(d)) {
                  blocked = true;
                  send('error', { message: SAFE_REPLY, error: SAFE_REPLY });
                  break;
                }
                full += d;
                send('delta', { text: d });
              }
            }
            if (blocked) return;
          } else {
            full = resp.choices?.[0]?.message?.content || '';
          }
          poem = normalizePoem(stripCodeFence(full), s);
          const cur = poemBodySentences(poem, s.cipai);
          const shapeOk = cur.length === s.shape.length && shapeOf(cur) === targetShape;
          // 判据零（内容质量，确定性检查）：模型会用「何事」凑二字句、照抄范例、把「加班」这类现代词写进词里
          const issues = checkPoemContent(cur, exemplars.flatMap((e) => e.sents));
          meterReport = null;
          if (issues.fillerLine || issues.modernWord || issues.copiedLine || issues.dupLine || issues.dupGram) {
            const badRank = shapeOk ? 2 : 3;
            if (badRank < best.rank) best = { rank: badRank, poem, report: null };
            retryReason = rewriteReason(issues);
            if (attempt < 4) {
              send('step', { label: contentIssueLabel(issues), detail: `${retryReason}正重写…` });
            }
          } else if (shapeOk) {
            // 判据二（格律后校验，中华新韵）：押韵 + 平仄；首轮须待流式结束后才能判定
            meterReport = checkMeter(cur, meterForm, s.cipai);
            const rank = meterReport.pass ? 0 : 1;
            if (rank < best.rank) best = { rank, poem, report: meterReport };
            if (meterReport.pass) break;
            retryReason = `上一版句数与字数已合规，但格律校验未通过（中华新韵）：${summarizeMeter(meterReport)}。`;
            if (attempt < 4) {
              send('step', {
                label: `格律校验 · ${s.form} 押韵/平仄未过`,
                detail: `${summarizeMeter(meterReport, 120)}，正按格律重写…`,
              });
            }
          } else {
            if (3 < best.rank) best = { rank: 3, poem, report: null };
            retryReason = `上一版写成 ${cur.length} 句（逐句字数 ${shapeOf(cur) || '—'}），不符合「${s.form} 应为 ${s.shape.length} 句、逐句字数依次 ${targetShape}」。`;
            if (attempt < 4) {
              send('step', {
                label: `体裁校验 · ${s.form} 需 ${s.shape.length} 句`,
                detail: `首轮输出 ${cur.length} 句（字数 ${shapeOf(cur)}），正按词牌/格律重写…`,
              });
            }
          }
        }
        if (!poem) throw new Error('empty output');
        // 采用「最合规」的一稿：4 轮都没全过时，不能把最后一版（可能韵脚更差）当作成品
        if (best.poem) {
          poem = best.poem;
          meterReport = best.report;
        }
        // 兜底：最终稿若未做过格律校验（如体裁校验 4 轮全败），按最终稿如实补算报告，
        // meter 未过项如实标注（沿用「返回最后一稿」的既有兜底，不额外增加重写轮次）
        if (!meterReport) {
          const cur = poemBodySentences(poem, s.cipai);
          if (cur.length) meterReport = checkMeter(cur, meterForm, s.cipai);
        }

        // 流结束后再一次性落库（创作记录 + 学习历史）
        let saved = false;
        if (session?.user?.id) {
          await prisma.creation.create({
            data: {
              userId: session.user.id,
              style: s.name,
              inputText: text.trim().slice(0, 500),
              outputText: poem.slice(0, 1000),
              model,
            },
          });
          await prisma.history.create({
            data: {
              userId: session.user.id,
              actionType: 'transfer',
              title: `${s.name}创作`,
              detail: text.trim().slice(0, 80),
            },
          });
          saved = true;
        }

        // done 附带精简格律报告：pass/rhymeOk/pingzeOk + 每句违规描述（前端徽章展示用）
        send('done', {
          poem,
          latencyMs: Date.now() - t0,
          saved,
          meter: meterReport
            ? {
                pass: meterReport.pass,
                rhymeOk: meterReport.rhymeOk,
                pingzeOk: meterReport.pingzeOk,
                lines: meterReport.lines.map((l) => l.issues),
              }
            : null,
        });
      } catch (e: any) {
        console.error('transfer stream error', e?.message || e);
        send('error', { error: 'AI生成失败，请重试' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
