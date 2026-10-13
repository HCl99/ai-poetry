import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { checkAiRateLimit } from '@/lib/rateLimit';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

type QuizType = 'choice' | 'blank' | 'appreciation';
type Difficulty = 'easy' | 'medium' | 'hard';

const quizTypes: Record<QuizType, string> = { choice: '选择题', blank: '填空题', appreciation: '鉴赏题' };
const diffLabels: Record<Difficulty, string> = { easy: '易', medium: '中', hard: '难' };

// 诗库总量缓存（随机 skip 用，60s 刷新）
let poemTotalCache: { n: number; at: number } | null = null;
async function poemTotal(): Promise<number> {
  if (poemTotalCache && Date.now() - poemTotalCache.at < 60_000) return poemTotalCache.n;
  const n = await prisma.poem.count();
  poemTotalCache = { n, at: Date.now() };
  return n;
}

async function randomPoem(): Promise<{ id: string; title: string; author: string; dynasty: string; lines: string[] }> {
  const total = await poemTotal();
  const skip = Math.floor(Math.random() * total);
  const rows = await prisma.poem.findMany({
    take: 1,
    skip,
    orderBy: { id: 'asc' },
    select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true, paragraphs: true },
  });
  const p = rows[0];
  const lines = ((p.paragraphsSimp as string[] | null) || (p.paragraphs as string[] | null) || []).filter(Boolean);
  return { id: p.id, title: p.title, author: p.author, dynasty: p.dynasty, lines: lines.length ? lines : ['（佚文）'] };
}

function pick<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** F5 常规测试题：出题（选择/填空程序生成，鉴赏随机诗 + AI 评分） */
export async function POST(req: Request) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  const { type, difficulty } = (await req.json()) as { type?: QuizType; difficulty?: Difficulty };
  if (!type || !['choice', 'blank', 'appreciation'].includes(type)) return Response.json({ error: '题型非法' }, { status: 400 });
  const diff: Difficulty = difficulty && ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';

  // 鉴赏题走 LLM 评分，纳入 AI 限流
  if (type === 'appreciation') {
    const limited = checkAiRateLimit(uid, 'quiz', 10);
    if (limited) return limited;
  }

  let question = '';
  let options: string[] | undefined;
  let answer = '';
  let poemMeta: { id: string; title: string; author: string; dynasty: string; excerpt: string[] } | null = null;
  let hint = '';

  if (type === 'choice') {
    const main = await randomPoem();
    const excerpt = main.lines.slice(0, 4);

    if (diff === 'easy') {
      // 作者题：同朝代干扰项
      const others = await prisma.poem.findMany({
        where: { dynasty: main.dynasty, author: { not: main.author } },
        select: { author: true },
        distinct: ['author'],
        take: 50,
      });
      const distractors = pick(others.map((o) => o.author), 3);
      options = pick([main.author, ...distractors], distractors.length + 1);
      question = `《${main.title}》的作者是谁？`;
      answer = main.author;
      hint = '根据诗风与朝代常识判断';
    } else if (diff === 'medium') {
      // 诗句题：哪句出自该诗
      const correct = main.lines[Math.floor(Math.random() * Math.min(main.lines.length, 4))] || main.lines[0];
      const sameAuthor = await prisma.poem.findMany({
        where: { author: main.author, id: { not: main.id } },
        select: { paragraphsSimp: true, paragraphs: true },
        take: 3,
      });
      const pool: string[] = [];
      for (const p of [...sameAuthor]) {
        const ls = ((p.paragraphsSimp as string[] | null) || (p.paragraphs as string[] | null) || []);
        if (ls[0]) pool.push(ls[0]);
      }
      while (pool.length < 3) {
        const r = await randomPoem();
        if (r.id !== main.id && r.lines[0] && r.lines[0] !== correct) pool.push(r.lines[0]);
      }
      options = [...new Set([correct, ...pool.filter((s) => s && s !== correct)])].slice(0, 4);
      if (!options.includes(correct)) options.unshift(correct);
      options = pick(options, options.length);
      question = `下列哪句诗出自《${main.title}》？`;
      answer = correct;
      hint = '注意意象与用词风格';
    } else {
      // 诗题配对：这句诗出自哪首诗
      const line = main.lines[Math.floor(Math.random() * Math.min(main.lines.length, 4))] || main.lines[0];
      const others = await prisma.poem.findMany({
        where: { title: { not: main.title } },
        select: { title: true, author: true },
        take: 50,
        skip: Math.floor(Math.random() * 1000),
      });
      const distractors = pick([...new Set(others.map((o) => o.title))], 3);
      options = pick([main.title, ...distractors], distractors.length + 1);
      question = `「${line}」出自哪首诗？`;
      answer = main.title;
      hint = '结合诗句意境与题目呼应';
    }
    poemMeta = { id: main.id, title: main.title, author: main.author, dynasty: main.dynasty, excerpt };
  } else if (type === 'blank') {
    const main = await randomPoem();
    const lines = main.lines.filter((l) => l.replace(/[^\u4e00-\u9fff]/g, '').length >= 4);
    if (!lines.length) return Response.json({ error: '出题失败，请重试' }, { status: 500 });
    const idx = Math.floor(Math.random() * lines.length);
    const target = lines[idx];

    if (diff === 'easy') {
      // 挖 2 字词：从原句中最长的连续汉字段取中段两字（避免标点导致 replace 失配）
      const runs: { start: number; len: number }[] = [];
      let rs = -1, rl = 0;
      for (let i = 0; i <= target.length; i++) {
        if (i < target.length && /[\u4e00-\u9fff]/.test(target[i])) {
          if (rs < 0) rs = i;
          rl++;
        } else if (rs >= 0) {
          runs.push({ start: rs, len: rl });
          rs = -1;
          rl = 0;
        }
      }
      const best = runs.filter((r) => r.len >= 4).sort((a, b) => b.len - a.len)[0];
      if (!best) return Response.json({ error: '出题失败，请重试' }, { status: 500 });
      const cut = best.start + Math.max(0, Math.floor(best.len / 2) - 1);
      question = `补全诗句：${target.slice(0, cut)}____${target.slice(cut + 2)}`;
      answer = target.slice(cut, cut + 2);
      hint = '上下句意连读即可推断';
    } else if (diff === 'medium') {
      // 整句挖空：题干展示其余句
      const rest = lines.filter((_, i) => i !== idx);
      question = `补全《${main.title}》中缺失的一句：\n${rest.slice(0, 3).map((l) => `${l} /`).join('\n')}\n____`;
      answer = target;
      hint = '按全诗韵脚与对句结构回忆';
    } else {
      // 连续两句
      const two = lines.slice(idx, idx + 2).join(' / ');
      const rest = lines.filter((_, i) => i < idx || i >= idx + 2);
      question = `补全《${main.title}》中缺失的两句：\n${rest.slice(0, 2).map((l) => `${l} /`).join('\n')}\n____`;
      answer = two;
      hint = '回忆全诗结构，注意起承转合';
    }
    poemMeta = { id: main.id, title: main.title, author: main.author, dynasty: main.dynasty, excerpt: main.lines.slice(0, 0) };
  } else {
    // 鉴赏题：优先有 AI 赏析参考的诗
    const total = await poemTotal();
    for (let i = 0; i < 5; i++) {
      const main = await randomPoem();
      const ann = await prisma.annotation.findUnique({ where: { poemId: main.id }, select: { shangxi: true, fanyi: true } });
      if (ann?.shangxi || ann?.fanyi) {
        question = `请赏析《${main.title}》（${main.dynasty}·${main.author}）：围绕核心意象与情感，写一段 100-200 字的鉴赏短评。`;
        answer = (ann.shangxi || ann.fanyi || '').slice(0, 400);
        poemMeta = { id: main.id, title: main.title, author: main.author, dynasty: main.dynasty, excerpt: main.lines.slice(0, 4) };
        hint = '从意象、手法、情感三个角度切入';
        break;
      }
      if (i === 4) {
        question = `请赏析《${main.title}》（${main.dynasty}·${main.author}）：围绕核心意象与情感，写一段 100-200 字的鉴赏短评。`;
        answer = `${main.title}·${main.author}`;
        poemMeta = { id: main.id, title: main.title, author: main.author, dynasty: main.dynasty, excerpt: main.lines.slice(0, 4) };
        hint = '从意象、手法、情感三个角度切入';
      }
    }
  }

  const rec = await prisma.quizRecord.create({
    data: {
      userId: uid,
      quizType: type,
      difficulty: diff,
      poemId: poemMeta?.id,
      question: question.slice(0, 500),
      options: options ?? undefined,
      answer: answer.slice(0, 500),
    },
  });

  return Response.json({
    id: String(rec.id),
    type,
    difficulty: diff,
    typeLabel: quizTypes[type],
    diffLabel: diffLabels[diff],
    question,
    options,
    poem: poemMeta,
    hint,
  });
}

/** F5 常规测试题：答题判分（选择/填空程序判分；鉴赏题 LLM 评分） */
export async function PUT(req: Request) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  const { id, userAnswer } = (await req.json()) as { id?: string; userAnswer?: string };
  if (!id) return Response.json({ error: '缺少题目 id' }, { status: 400 });
  const text = userAnswer?.trim();
  if (!text) return Response.json({ error: '请填写答案' }, { status: 400 });

  let rid: bigint;
  try {
    rid = BigInt(id);
  } catch {
    return Response.json({ error: 'id 非法' }, { status: 400 });
  }
  const rec = await prisma.quizRecord.findUnique({ where: { id: rid } });
  if (!rec || rec.userId !== uid) return Response.json({ error: '题目不存在' }, { status: 404 });
  if (rec.userAnswer !== null) return Response.json({ error: '该题已作答' }, { status: 400 });

  const normalize = (s: string) => s.replace(/[\s，。！？、；：''""《》〈〉·.,!?;:'"()（）]/g, '');

  let score: number;
  let feedback: string;

  if (rec.quizType === 'choice') {
    const correct = text === rec.answer;
    score = correct ? 100 : 0;
    feedback = correct ? '回答正确！' : `回答错误，正确答案是「${rec.answer}」`;
  } else if (rec.quizType === 'blank') {
    const ok = normalize(text) === normalize(rec.answer) || (normalize(rec.answer).length >= 2 && normalize(text).includes(normalize(rec.answer)));
    score = ok ? 100 : 0;
    feedback = ok ? '回答正确！' : `回答错误，正确答案是「${rec.answer}」`;
  } else {
    // 鉴赏题：LLM 评分
    try {
      const poem = rec.poemId ? await prisma.poem.findUnique({ where: { id: rec.poemId }, select: { title: true, author: true, dynasty: true, paragraphsSimp: true, paragraphs: true } }) : null;
      const lines = poem ? ((poem.paragraphsSimp as string[] | null) || (poem.paragraphs as string[] | null) || []).join('\n') : '';
      const resp = await client.chat.completions.create({
        model: 'glm-4-flash',
        messages: [
          { role: 'system', content: '你是古典诗词阅卷老师。只输出 JSON，格式：{"score": 0到100的整数, "comment": "60字以内的点评"}，不要输出其他内容。' },
          {
            role: 'user',
            content: `【原诗】《${poem?.title}》〔${poem?.dynasty}〕${poem?.author}\n${lines}\n\n【参考赏析】${rec.answer.slice(0, 400)}\n\n【学生答案】${text.slice(0, 600)}\n\n请从意象把握、手法分析、情感理解三方面评分并点评。`,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      });
      const raw = resp.choices?.[0]?.message?.content || '';
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) as { score?: number; comment?: string } : null;
      score = Math.max(0, Math.min(100, Math.round(Number(parsed?.score) || 0)));
      feedback = parsed?.comment?.slice(0, 200) || '已记录答案';
    } catch (e) {
      console.error('quiz appreciation grade error', (e as Error)?.message);
      score = 60;
      feedback = 'AI 评分暂时不可用，已记录你的答案，可稍后重试';
    }
  }

  const updated = await prisma.quizRecord.update({
    where: { id: rid },
    data: { userAnswer: text.slice(0, 500), score, feedback },
  });

  await prisma.history.create({
    data: {
      userId: uid,
      actionType: 'quiz',
      title: `诗词测验 · ${quizTypes[updated.quizType as QuizType] || updated.quizType}（${diffLabels[updated.difficulty as Difficulty] || ''}）`,
      detail: `得分 ${score}${feedback ? ` · ${feedback.slice(0, 60)}` : ''}`,
    },
  });

  return Response.json({
    id: String(updated.id),
    score,
    answer: rec.answer,
    feedback,
  });
}

/** F5 常规测试题：学习记录 + 统计 */
export async function GET() {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  const [records, agg, correctCount] = await Promise.all([
    prisma.quizRecord.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.quizRecord.aggregate({ where: { userId: uid }, _count: { _all: true }, _avg: { score: true } }),
    prisma.quizRecord.count({ where: { userId: uid, quizType: { in: ['choice', 'blank'] }, score: 100 } }),
  ]);

  const objective = await prisma.quizRecord.count({ where: { userId: uid, quizType: { in: ['choice', 'blank'] } } });

  return Response.json({
    records: records.map((r) => ({
      id: String(r.id), type: r.quizType, difficulty: r.difficulty,
      question: r.question.slice(0, 80), score: r.score, feedback: r.feedback?.slice(0, 80) || null,
      createdAt: r.createdAt.toISOString(),
    })),
    stats: {
      total: agg._count._all,
      avgScore: agg._avg.score != null ? Math.round(agg._avg.score) : null,
      objectiveCorrect: correctCount,
      objectiveTotal: objective,
    },
  });
}
