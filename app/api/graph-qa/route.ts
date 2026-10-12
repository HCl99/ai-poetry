import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { SSE_HEADERS, sseEvent } from '@/lib/sse';
import { checkAiRateLimit } from '@/lib/rateLimit';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

type Row = { s: string; t: string; w: number };

/** 图谱问答（GraphRAG）：从关系库抽取问题相关子图，仅依据子图数据回答 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'graph-qa', 10);
  if (limited) return limited;

  const { kind, question } = (await req.json()) as { kind?: 'poet' | 'imagery'; question?: string };
  if (!question?.trim()) return Response.json({ error: '缺少 question' }, { status: 400 });
  if (kind !== 'poet' && kind !== 'imagery') return Response.json({ error: 'kind 必须是 poet 或 imagery' }, { status: 400 });

  const q = question.trim().slice(0, 100);
  const ctxLines: string[] = [];

  if (kind === 'poet') {
    // 全部诗人名（去重），按长度降序匹配问题中出现的名字（最多 2 位）
    const nameRows = await prisma.$queryRaw<{ n: string }[]>`
      SELECT DISTINCT source AS n FROM poet_relations
      UNION DISTINCT SELECT target AS n FROM poet_relations`;
    const names = nameRows.map((r) => r.n);
    const matched = names.filter((n) => q.includes(n)).sort((a, b) => b.length - a.length).slice(0, 2);

    if (matched.length === 0) {
      // 未命中具体诗人 → 全局摘要
      const total = await prisma.poetRelation.aggregate({ _count: true, _sum: { weight: true } });
      const top = await prisma.poetRelation.groupBy({ by: ['source'], _sum: { weight: true }, orderBy: { _sum: { weight: 'desc' } }, take: 3 });
      ctxLines.push(`全图共 ${total._count} 条诗人互提关联边，互提总次数 ${total._sum.weight || 0}`);
      for (const t of top) {
        const bio = await prisma.poetBio.findFirst({ where: { name: t.source }, select: { dynasty: true } });
        ctxLines.push(`「${t.source}」（${bio?.dynasty || '唐'}）关联最广，互提总权重 ${t._sum.weight || 0}`);
      }
    } else {
      for (const name of matched) {
        const bio = await prisma.poetBio.findFirst({ where: { name }, select: { dynasty: true } });
        const edges = (await prisma.$queryRaw<Row[]>`
          SELECT source AS s, target AS t, weight AS w FROM poet_relations
          WHERE source = ${name} OR target = ${name}
          ORDER BY weight DESC LIMIT 8`) as Row[];
        const deg = await prisma.poetRelation.count({ where: { OR: [{ source: name }, { target: name }] } });
        // 关系库含双向边，按无向对去重后取关系最近的几位
        const seen = new Set<string>();
        const uniq = edges.filter((e) => {
          const key = [e.s, e.t].sort().join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const rel = uniq
          .map((e) => `${e.s === name ? e.t : e.s}（互提 ${e.w} 次）`)
          .join('、');
        ctxLines.push(`「${name}」〔${bio?.dynasty || '唐'}〕共关联 ${deg} 位诗人，关系最近的包括：${rel}`);
      }
    }
  } else {
    // 意象问答
    const chars = (await prisma.imagery.findMany({ orderBy: { count: 'desc' }, take: 200 })).map((i) => i.char);
    const matched = chars.filter((c) => q.includes(c)).slice(0, 2);

    if (matched.length === 0) {
      const total = await prisma.imagery.aggregate({ _count: true });
      const top = await prisma.imagery.findMany({ orderBy: { count: 'desc' }, take: 5 });
      ctxLines.push(`意象库共 ${total._count} 个核心意象`);
      ctxLines.push(`出现最多的意象：${top.map((t) => `「${t.char}」${t.count} 首`).join('、')}`);
    } else {
      for (const c of matched) {
        const im = await prisma.imagery.findUnique({ where: { char: c } });
        const co = (await prisma.$queryRaw<Row[]>`
          SELECT source_char AS s, target_char AS t, weight AS w FROM imagery_cooccurrence
          WHERE source_char = ${c} OR target_char = ${c}
          ORDER BY weight DESC LIMIT 8`) as Row[];
        const rel = co.map((e) => `「${e.s === c ? e.t : e.s}」共现 ${e.w} 次`).join('、');
        const samples = await prisma.poemImagery.findMany({
          where: { imageryChar: c },
          take: 3,
          include: { poem: { select: { title: true, author: true } } },
        });
        ctxLines.push(
          `意象「${c}」出现在 ${im?.count || 0} 首诗中；共现最强的意象：${rel || '暂无'}；含该意象的诗例：${samples
            .map((s) => `《${s.poem.title}》${s.poem.author}`)
            .join('、') || '暂无'}`,
        );
      }
    }
  }

  const t0 = Date.now();
  const model = 'glm-4-flash';
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));
      try {
        const prompt = `以下是知识图谱中与问题相关的真实数据：

${ctxLines.join('\n')}

【用户问题】${q}

请仅依据上述图谱数据回答，120 字以内。数据中的次数、数量可以直接引用；若数据不足以回答问题的某个部分，请明确说明「图谱暂无该数据」，严禁编造任何数字或关系。`;

        const resp = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: '你是诗词知识图谱分析助手，严格基于给定图数据回答，不编造。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 400,
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
        send('done', { latencyMs: Date.now() - t0, model, context: ctxLines });
      } catch (e: any) {
        console.error('graph-qa error', e?.message || e);
        send('error', { error: '图谱问答失败，请重试' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
