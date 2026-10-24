import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { embedText } from '@/lib/embedding';
import { topKSimilar } from '@/lib/vectorStore';
import { rerankTopN } from '@/lib/reranker';
import { SSE_HEADERS, sseEvent } from '@/lib/sse';
import { checkAiRateLimit } from '@/lib/rateLimit';
import { screenInput, createOutputGuard, SAFE_REPLY } from '@/lib/content-filter';
import { checkMeter, summarizeMeter, meterFormFor, type MeterReport } from '@/lib/meter';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

/**
 * 风格库：每种风格对应各自的体裁与写法（诗/词分属两类，且句数、句式、押韵各不相同），
 * 全部写死在提示词里以确保「风格 ↔ 体裁」一一对上号。
 * 此前体裁统一写死为「七言绝句」，导致宋词（苏轼/婉约）被写成唐诗、杜甫体标称律诗却只出四句。
 */
const STYLES: Record<string, { name: string; desc: string; author: string; genre: '诗' | '词'; form: string; formHint: string; shape: number[]; cipai?: string; blankAfter?: number }> = {
  libai: {
    name: '李白体', desc: '浪漫飘逸、想象瑰奇、豪放不羁，善用夸张与明月酒仙意象',
    author: '李白', genre: '诗', form: '七言绝句', shape: [7, 7, 7, 7],
    formHint: '七言绝句：共 4 句，每句 7 字（不计标点），第 2、4 句押韵',
  },
  sushi: {
    name: '苏轼体', desc: '旷达豪放、超然物外、于困境中见豁达，理趣与深情并存',
    author: '苏轼', genre: '词', form: '豪放词 · 定风波', shape: [7, 7, 7, 2, 7, 7, 2, 7, 7, 2, 7], cipai: '定风波', blankAfter: 5,
    formHint: '《定风波》词牌：共 11 句（62 字）——上阕 5 句，字数依次 7·7·7·2·7；下阕 6 句，字数依次 7·2·7·7·2·7；「2」为二字顿句（如苏轼「谁怕」），隔句押平韵',
  },
  wanyue: {
    name: '婉约体', desc: '婉转含蓄、细腻缠绵，善写离愁别绪，兼具易安之深情与奇思（类李清照）',
    author: '李清照', genre: '词', form: '婉约词 · 浣溪沙', shape: [7, 7, 7, 7, 7, 7], cipai: '浣溪沙', blankAfter: 3,
    formHint: '《浣溪沙》词牌：共 6 句（42 字）——上阕 3 句、下阕 3 句，每句均为 7 字，句句押韵（下阕首句多用对仗）',
  },
  wangwei: {
    name: '王维体', desc: '空灵静谧、诗中有画，山水田园与禅意交融',
    author: '王维', genre: '诗', form: '五言绝句', shape: [5, 5, 5, 5],
    formHint: '五言绝句：共 4 句，每句 5 字（不计标点），第 2、4 句押韵，写山水田园而含禅意',
  },
  dufu: {
    name: '杜甫体', desc: '沉郁顿挫、忧国忧民、格律谨严，善写乱世羁旅与家国之思',
    author: '杜甫', genre: '诗', form: '七言律诗', shape: [7, 7, 7, 7, 7, 7, 7, 7],
    formHint: '七言律诗：共 8 句，每句 7 字（不计标点），第 2、4、6、8 句押韵，中间两联（第 3-4 句、第 5-6 句）必须对仗',
  },
};

/** 常见词牌名：用于从库中筛出真正的「词」范例（避开词牌与乐府诗题重名之外的干扰） */
const CIPAI_RE = /如梦令|一剪梅|声声慢|醉花阴|水调歌头|念奴娇|江城子|定风波|蝶恋花|临江仙|浣溪沙|菩萨蛮|卜算子|虞美人|青玉案|雨霖铃|满江红|西江月|鹧鸪天|清平乐|渔家傲|苏幕遮|踏莎行|南乡子|忆江南|长相思|点绛唇|生查子|谒金门|好事近|眼儿媚|乌夜啼|相见欢|阮郎归|风入松|齐天乐|兰陵王|木兰花|玉楼春|醉花间|望海潮|解语花|桂枝香|水龙吟|望江南|少年游|八声甘州|摸鱼儿|贺新郎|沁园春|永遇乐|醉蓬莱|凤箫吟|渡江云|高阳台|扬州慢|疏影|暗香|六丑|汉宫春|千秋岁|蓦山溪|粉蝶儿|风流子|望海潮|石州慢|锁窗寒|庆春宫|夜飞鹊|瑞龙吟|莺啼序|凤凰台上忆吹箫|祝英台近/;

/** 标点字符集（计字数时剔除） */
const PUNCT_RE = /[，。！？；：、（）「」『』《》〈〉〔〕【】·\s]/g;

/**
 * 把库中存储的诗行按句读拆成「句」。
 * 关键：语料库多为「两句一行」（如杜甫七律存成 4 行 × 14 字），
 * 若直接用 `lines.length` 当作句数，会把七律误判为 4 句（绝句），
 * 导致「范例体裁与目标不符 → 模型照抄错句式 → 对不上号」。必须先拆句。
 */
function toSentences(lines: string[]): string[] {
  const out: string[] = [];
  for (const ln of lines) {
    const t = (ln || '').trim();
    if (!t) continue;
    const parts = t.match(/[^，。！？；、]*[，。！？；、]|[^，。！？；、]+$/g) || [t];
    for (const p of parts) {
      const q = p.trim();
      if (q) out.push(q);
    }
  }
  return out;
}

/** 句式指纹：逐句「不计标点的字数」用逗号连接，如七律为 "7,7,7,7,7,7,7,7"、定风波为 "7,7,7,2,7,7,2,7,7,2,7" */
function shapeOf(sents: string[]): string {
  return sents.map((x) => x.replace(PUNCT_RE, '').length).join(',');
}

/**
 * 规整生成结果的版式，保证「风格 ↔ 体裁」对得上号：
 *  1) 把挤在同一行的多句按句末标点拆开，做到「一句一行」；
 *  2) 词作首行补上词牌名，并与正文之间留一空行；
 *  3) 词作上下阕之间留一空行。
 * 模型（glm-4-flash）常不按提示换行或漏写词牌名，此处做确定性兜底。
 */
function normalizePoem(raw: string, s: { genre: '诗' | '词'; cipai?: string; blankAfter?: number }): string {
  const seg: string[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.match(/[^，。！？；、]*[，。！？；、]|[^，。！？；、]+$/g) || [t];
    for (const p of parts) {
      const q = p.trim();
      if (q) seg.push(q);
    }
  }
  let head = 0;
  if (s.genre === '词' && s.cipai) {
    const bare = (x: string) => x.replace(/[《》〈〉〔〕[\]·\s]/g, '');
    if (seg.length && (bare(seg[0]) === s.cipai || bare(seg[0]).startsWith(s.cipai))) seg.shift();
    seg.unshift(s.cipai);
    head = 1;
  }
  const out: string[] = [];
  let sent = 0;
  seg.forEach((l, i) => {
    if (i === head) out.push('');                                // 词牌名与正文之间
    if (s.blankAfter && i === head + s.blankAfter) out.push(''); // 上下阕之间
    let x = l;
    // 诗体：模型偶有漏写行末标点，按近体诗惯例补（奇句收「，」、偶句收「。」）
    if (s.genre === '诗' && !/[，。！？；、]$/.test(x)) x += sent % 2 === 0 ? '，' : '。';
    sent++;
    out.push(x);
  });
  return out.join('\n');
}

export async function POST(req: Request) {
  const session = await auth();
  const limited = checkAiRateLimit(session?.user?.id || 'anon', 'transfer', 6);
  if (limited) return limited;
  const { text, style } = (await req.json()) as { text?: string; style?: string };

  // 开流前的参数校验仍返回普通 JSON 错误，便于前端直接读取
  if (!text?.trim()) return Response.json({ error: '请输入现代文内容' }, { status: 400 });
  if (!style || !STYLES[style]) return Response.json({ error: '请选择风格' }, { status: 400 });

  const screen = screenInput(text);
  if (!screen.ok) return Response.json({ error: screen.reason }, { status: 400 });

  const s = STYLES[style];
  const model = 'glm-4-flash';
  const t0 = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));
      try {
        /* ---- RAG：向量粗排 → CrossEncoder 精排，检索该风格诗人的语义相近范例 ---- */
        const queryVec = await embedText(text.trim());
        // score: 粗排余弦（展示）；rerankScore: 精排相关度（排序依据）
        let exemplars: { title: string; sents: string[]; score: number; rerankScore?: number }[] = [];
        let rerankApplied = false;
        if (queryVec) {
          // 目标句式指纹（如七律 "7,7,7,7,7,7,7,7"、定风波 "7,7,7,2,7,7,2,7,7,2,7"）：
          // 只有「句式与目标完全一致」的原作才可作为范例，避免模型照抄到错体裁的句式。
          const targetShape = s.shape.join(',');
          // 词风：优先取该作者**同一词牌**的原作范例（库中确有苏轼《定风波》、李清照《如梦令》）。
          const ciFilter = (t: string | undefined) =>
            s.cipai ? (t || '').includes(s.cipai) : CIPAI_RE.test(t || '');
          // 召回放宽到 300：语料库按「两句一行」存储，同句式的作品占比不高，k 过小会漏掉
          let coarse = await topKSimilar(
            queryVec,
            300,
            undefined,
            (m) => m.author === s.author && (s.genre === '诗' || ciFilter(m.title)),
          );
          if (!coarse.length && s.genre === '词') {
            coarse = await topKSimilar(
              queryVec,
              300,
              undefined,
              (m) => m.author === s.author && CIPAI_RE.test(m.title || ''),
            );
          }
          if (coarse.length) {
            const rows = await prisma.poem.findMany({
              where: { id: { in: coarse.map((h) => h.id) } },
              select: { id: true, paragraphsSimp: true, paragraphs: true },
            });
            const infoMap = new Map(
              rows.map((r) => {
                const lines = ((r.paragraphsSimp as string[] | null) || (r.paragraphs as string[] | null) || []) as string[];
                return [r.id, toSentences(lines)];
              }),
            );
            let cands = coarse.map((h) => ({
              title: h.title,
              sents: infoMap.get(h.id) || [],
              score: h.score,
            }));
            // 只保留句式与目标体裁完全一致者——这是「风格 ↔ 体裁」对上号的关键
            const exact = cands.filter((c) => c.sents.length && shapeOf(c.sents) === targetShape);
            if (exact.length) cands = exact;
            const rankedInput = cands.map((c) => ({ ...c, body: c.sents.join('') }));
            const reranked = await rerankTopN(
              text.trim(),
              rankedInput,
              (item) => `《${item.title}》：${item.body}`,
              3,
            );
            if (reranked) {
              exemplars = reranked.map((r) => ({ title: r.item.title, sents: r.item.sents, score: r.item.score, rerankScore: r.score }));
              rerankApplied = true;
            } else {
              exemplars = cands.slice(0, 3).map((c) => ({ title: c.title, sents: c.sents, score: c.score }));
            }
          }
        }
        send('step', {
          label: rerankApplied ? 'RAG · 风格范例检索（向量+精排）' : 'RAG · 风格范例检索',
          detail: exemplars.length
            ? exemplars.map((e) => `《${e.title}》 ${rerankApplied ? `精排 ${e.rerankScore}` : `相似度 ${e.score}`}`).join('；')
            : '未命中范例，使用模型内知识',
        });

        const exemplarCtx = exemplars.length
          ? `\n\n【${s.author}原作范例（向量语义检索）】\n${exemplars.map((e) => `《${e.title}》：${e.sents.join('')}`).join('\n')}`
          : '';
        // 句式蓝本：取「句式与目标体裁完全一致」的原作（库中确有苏轼《定风波》、李清照《浣溪沙》同句式的原作）。
        // flash 对纯文字描述的字数极不敏感，必须给一份同句式的原作对照才可能「对上号」。
        // 实测对照：原样罗列原作（本式）命中率显著高于「逐句编号｜字数｜原文」（编号会被 flash 误读，反而 0 命中）。
        const bp = exemplars.find((e) => e.sents.length && shapeOf(e.sents) === s.shape.join(','));
        const blueprint = bp
          ? `【句式蓝本】${s.author}《${bp.title}》原作，逐句字数依次 ${shapeOf(bp.sents)}（务必逐句对应改写，每句字数与原句完全一致，只换字词、严禁照抄原句、严禁重复任何一行）：\n${bp.sents.join('\n')}`
          : `【句式蓝本】目标体裁${s.form}，共 ${s.shape.length} 句，逐句字数依次 ${s.shape.join('·')}，请严格按此句式逐句填写。`;
        // 体裁分支：诗（唐代诗人）与词（宋代词人）要求不同，避免宋词被写成唐诗的绝句/律诗
        const isCi = s.genre === '词';
        // 逐句字数格模板：让模型「以字填格」，比抽象描述更能锁住词牌句式
        const cellRows: string[] = [];
        s.shape.forEach((n, i) => {
          if (s.blankAfter && i === s.blankAfter) cellRows.push('    │');
          cellRows.push(`${String(i + 1).padStart(2, ' ')}  │ ${'○'.repeat(n)}`);
        });
        const scaffold = cellRows.join('\n');
        const tot = s.shape.reduce((a, b) => a + b, 0);
        const hardRules = `【格式硬约束·必须逐句核对】体裁为${s.form}，共 ${s.shape.length} 句、全篇共 ${tot} 字（标点不计），逐句单独成行（严禁两句挤在同一行），逐句字数：${s.shape.map((n, i) => `第${i + 1}句${n}字`).join('；')}。请严格「以字填格」，每行只填一格、不得增删行数：
${scaffold}
${s.blankAfter ? '（模板中的空行即上下阕分界）\n' : ''}`;
        // 词：不展示 ○ 字格模板（实测 flash 会把模板当正文一起输出），只给「原作句式蓝本 + 逐句字数」；
        // 且提示尽量精简——冗长要求会让 flash 直接忽略字数约束、写成七言齐言。
        const ciRules = `【格式要求】体裁为${s.form}，共 ${s.shape.length} 句、全篇共 ${tot} 字（标点不计），逐句单独成行（严禁两句挤在同一行），逐句字数依次为 ${s.shape.join('、')}；务必逐句对齐、不得增删行数。${s.blankAfter ? '上、下阕之间空一行。' : ''}
只输出正文（不含词牌名、不解释）。`;
        const prompt = isCi
          ? `请将下面的现代文改写为一首词，模仿${s.name}的风格（${s.desc}）。
【现代文】${text.trim()}
${blueprint}
${ciRules}`
          : `请将下面的现代文改写为一首诗，严格模仿${s.name}的风格特征（${s.desc}）。

【现代文】${text.trim()}
${exemplarCtx}${blueprint}
【要求】
1. 体裁为${s.formHint}
2. 提取现代文中的核心意象与情感
3. 符合${s.name}的典型意象偏好与语言气质${exemplars.length ? '，可参考上述范例的遣词与气韵（化用而非抄袭）' : ''}
4. 平仄大致协调，偶数句押韵；句数与每句字数必须严格符合上述体裁（绝句四句、律诗八句），不得多写或少写
5. 只输出诗词正文（不要解释、不要标题）

${hardRules}`;

        send('meta', { style: s.name, form: s.form, genre: s.genre, model, exemplars: exemplars.map((e) => ({ title: e.title, score: e.score })) });

        // 生成 + 体裁校验：模型（glm-4-flash）句数/句式不稳定，若与体裁要求不符则重写，
        // 确保「风格 ↔ 体裁」对得上号（七绝 4 句 / 五绝 4 句 / 七律 8 句 / 定风波 11 句 / 浣溪沙 6 句）。
        const SYS = '你是精通古典诗词格律的AI诗人。必须严格按指定体裁的句数、每句字数与押韵规则创作，只输出诗词正文，不输出任何解释。';
        const clean = (t: string) => t.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim();
        // 取正文各句（剔除词牌名行），用于核对句数与逐句字数
        const bodySents = (p: string) =>
          p
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !(s.cipai && l.replace(/[《》〈〉〔〕·\s]/g, '').startsWith(s.cipai)));
        const targetShape = s.shape.join(',');
        // 格律校验形式：诗按句数/句长区分（五绝/七绝/七律），词走 cipai 押韵分支
        const meterForm = meterFormFor(s.shape, s.genre);

        let poem = '';
        let full = '';
        let meterReport: MeterReport | null = null;
        const guard = createOutputGuard();
        // 上一轮未通过原因（体裁/格律），注入下一轮重写 prompt；首轮为空
        let retryReason = '';
        for (let attempt = 1; attempt <= 4; attempt++) {
          const streamThis = attempt === 1; // 首轮流式（即时反馈），校验不过的重写走非流式
          // 重写提示**不再回喂「上一次输出」**：实测 flash 看到旧稿会在其后原样续写/复读，
          // 反而越写越长；只告知失败原因并重申句式，让它独立重写。
          const user =
            attempt === 1
              ? prompt
              : `${prompt}\n\n【重写要求】${retryReason}请重新独立创作：严格写 ${s.shape.length} 句、每句单独成行、逐句字数严格对应上表${s.genre === '词' ? '；韵脚按词牌押同一韵部' : '；偶数句末字押同一韵部且用平声、奇数句（首句除外）末字用仄声，注意第 2、4、6 字平仄交替'}；严禁重复任何一句、严禁照抄上一版。`;
          const resp: any = await client.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: SYS },
              { role: 'user', content: user },
            ],
            // 温度错档：词用偏低但非极低的温度（0.2 的贪心解码易陷入复读循环），逐轮变换以跳出局部死循环
            temperature: (s.genre === '词' ? [0.5, 0.7, 0.4, 0.8] : [0.75, 0.6, 0.9, 0.7])[attempt - 1] ?? 0.7,
            max_tokens: 300,
            stream: streamThis,
          } as any);
          if (streamThis) {
            full = '';
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
          poem = normalizePoem(clean(full), s);
          // 判据一（体裁硬校验）：句数一致 且 逐句字数与目标句式完全一致
          const cur = bodySents(poem);
          const shapeOk = cur.length === s.shape.length && shapeOf(cur) === targetShape;
          meterReport = null;
          if (shapeOk) {
            // 判据二（格律后校验，中华新韵）：押韵 + 平仄；首轮须待流式结束后才能判定
            meterReport = checkMeter(cur, meterForm, s.cipai);
            if (meterReport.pass) break;
            retryReason = `上一版句数与字数已合规，但格律校验未通过（中华新韵）：${summarizeMeter(meterReport)}。`;
            if (attempt < 4) {
              send('step', {
                label: `格律校验 · ${s.form} 押韵/平仄未过`,
                detail: `${summarizeMeter(meterReport, 120)}，正按格律重写…`,
              });
            }
          } else {
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
        // 兜底：最终稿若未做过格律校验（如体裁校验 4 轮全败），按最终稿如实补算报告，
        // meter 未过项如实标注（沿用「返回最后一稿」的既有兜底，不额外增加重写轮次）
        if (!meterReport) {
          const cur = bodySents(poem);
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
