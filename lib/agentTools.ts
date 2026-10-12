import { prisma } from '@/lib/prisma';

/**
 * GraphRAG Agent 工具层：模型通过 Function Calling 自主决定调用哪个查询工具，
 * 工具执行器全部读取库内真实数据（诗人互提 / 意象共现 / 诗篇全文 / 全图概览），
 * 返回文本同时收集命中的诗题，供最终回答的引用硬约束校验使用。
 */

export interface AgentToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_poet_relations',
      description: '查询一位诗人在图谱中的互提关系（与哪些诗人交往密切、互提次数）及其朝代。适用于诗人交往、相互影响、流派传承类问题。',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: '诗人姓名，如 李白' } },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_imagery',
      description: '查询一个核心意象（如 月、柳、雁）在全库的出现统计、共现最强的意象、含该意象的诗例。适用于意象象征、情感承载类问题。',
      parameters: {
        type: 'object',
        properties: { char: { type: 'string', description: '单个汉字意象，如 月' } },
        required: ['char'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_poems',
      description: '按关键词检索诗篇（匹配诗题、作者或正文），返回诗题、作者与正文节选。适用于查证诗句出处、举例佐证类问题。',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string', description: '关键词，如 孤帆 或 王维' } },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_graph_overview',
      description: '获取知识图谱全局摘要（诗人互提边总数、关联最广的诗人、最高频意象）。适用于总体概况类问题。',
      parameters: { type: 'object', properties: {} },
    },
  },
];

type Row = { s: string; t: string; w: number };

function bodyOf(val: unknown): string {
  let arr: unknown = val;
  if (typeof val === 'string') {
    try { arr = JSON.parse(val); } catch { return String(val).slice(0, 60); }
  }
  if (Array.isArray(arr)) {
    return arr.filter((x): x is string => typeof x === 'string').join(' ').slice(0, 80);
  }
  return '';
}

/** 执行 Agent 工具调用：返回供模型阅读的结果文本 + 命中的诗题集合（引用校验素材） */
export async function executeAgentTool(name: string, rawArgs: string): Promise<{ text: string; poemTitles: string[] }> {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(rawArgs || '{}'); } catch { /* 参数解析失败按空处理 */ }
  const poemTitles: string[] = [];
  let text = '';

  if (name === 'search_poet_relations') {
    const poetName = String(args.name || '').trim().slice(0, 20);
    if (!poetName) { text = '参数 name 为空，无法查询'; }
    else {
      const bio = await prisma.poetBio.findFirst({ where: { name: poetName }, select: { dynasty: true } });
      const edges = (await prisma.$queryRaw<Row[]>`
        SELECT source AS s, target AS t, weight AS w FROM poet_relations
        WHERE source = ${poetName} OR target = ${poetName}
        ORDER BY weight DESC LIMIT 8`) as Row[];
      if (edges.length === 0) {
        text = `图谱中未收录「${poetName}」的互提关系`;
      } else {
        const seen = new Set<string>();
        const uniq = edges.filter((e) => {
          const key = [e.s, e.t].sort().join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const deg = await prisma.poetRelation.count({ where: { OR: [{ source: poetName }, { target: poetName }] } });
        text = `「${poetName}」〔${bio?.dynasty || '唐'}〕共关联 ${deg} 位诗人，关系最近的包括：${uniq
          .map((e) => `${e.s === poetName ? e.t : e.s}（互提 ${e.w} 次）`)
          .join('、')}`;
      }
    }
  } else if (name === 'search_imagery') {
    const char = String(args.char || '').trim().slice(0, 1);
    if (!char) { text = '参数 char 为空，无法查询'; }
    else {
      const im = await prisma.imagery.findUnique({ where: { char } });
      if (!im) {
        text = `意象库中未收录「${char}」`;
      } else {
        const co = (await prisma.$queryRaw<Row[]>`
          SELECT source_char AS s, target_char AS t, weight AS w FROM imagery_cooccurrence
          WHERE source_char = ${char} OR target_char = ${char}
          ORDER BY weight DESC LIMIT 8`) as Row[];
        const rel = co.map((e) => `「${e.s === char ? e.t : e.s}」共现 ${e.w} 次`).join('、');
        const samples = await prisma.poemImagery.findMany({
          where: { imageryChar: char },
          take: 4,
          include: { poem: { select: { title: true, author: true } } },
        });
        samples.forEach((s) => poemTitles.push(s.poem.title));
        text = `意象「${char}」出现在 ${im.count} 首诗中；共现最强的意象：${rel || '暂无'}；含该意象的诗例：${samples
          .map((s) => `《${s.poem.title}》${s.poem.author}`)
          .join('、') || '暂无'}`;
      }
    }
  } else if (name === 'search_poems') {
    const kw = String(args.keyword || '').trim().slice(0, 20);
    if (!kw) { text = '参数 keyword 为空，无法检索'; }
    else {
      const rows = (await prisma.$queryRaw<{ id: unknown; title: string; author: string; dynasty: string; paragraphs_simp: unknown }[]>`
        SELECT id, title, author, dynasty, paragraphs_simp FROM poems
        WHERE title LIKE ${`%${kw}%`} OR author LIKE ${`%${kw}%`} OR CAST(paragraphs_simp AS CHAR) LIKE ${`%${kw}%`}
        ORDER BY id LIMIT 5`) as { title: string; author: string; dynasty: string; paragraphs_simp: unknown }[];
      if (rows.length === 0) {
        text = `库内未检索到与「${kw}」相关的诗篇`;
      } else {
        rows.forEach((r) => poemTitles.push(r.title));
        text = rows.map((r) => `《${r.title}》〔${r.dynasty}〕${r.author}：${bodyOf(r.paragraphs_simp)}`).join('\n');
      }
    }
  } else if (name === 'get_graph_overview') {
    const relTotal = await prisma.poetRelation.aggregate({ _count: true, _sum: { weight: true } });
    const topPoets = await prisma.poetRelation.groupBy({ by: ['source'], _sum: { weight: true }, orderBy: { _sum: { weight: 'desc' } }, take: 3 });
    const imageryTotal = await prisma.imagery.aggregate({ _count: true });
    const topImagery = await prisma.imagery.findMany({ orderBy: { count: 'desc' }, take: 5 });
    text = `诗人关系图谱共 ${relTotal._count} 条互提边（互提总次数 ${relTotal._sum.weight || 0}）；关联最广的诗人：${topPoets
      .map((t) => `「${t.source}」互提 ${t._sum.weight || 0} 次`)
      .join('、')}。意象库共 ${imageryTotal._count} 个核心意象；最高频意象：${topImagery
      .map((t) => `「${t.char}」${t.count} 首`)
      .join('、')}`;
  } else {
    text = `未知工具 ${name}，可用工具：${AGENT_TOOLS.map((t) => t.function.name).join('、')}`;
  }

  return { text, poemTitles };
}
