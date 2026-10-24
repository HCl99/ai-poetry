import { prisma } from '@/lib/prisma';

/**
 * MCP（Model Context Protocol）工具层 —— 对应 PRD 4.8 节。
 * 2 个工具（search_poetry / get_annotation）均按 MCP tools/call 的 content 结构返回，
 * 由 app/api/mcp/route.ts 以 JSON-RPC 2.0 暴露给站内面板与外部 Agent 客户端。
 */

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: 'search_poetry',
    description: '按关键词/朝代/意象检索诗词，返回诗篇 ID、标题、作者、朝代与正文节选',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '关键词，匹配诗题、作者或正文' },
        dynasty: { type: 'string', description: '朝代过滤，如 唐、宋' },
        imagery: { type: 'string', description: '意象过滤，单个汉字，如 月' },
        top_k: { type: 'integer', description: '返回条数，默认 5，最大 20' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'get_annotation',
    description: '获取指定诗词的库内标注：译文 / 赏析 / 注释及标注来源',
    inputSchema: {
      type: 'object',
      properties: {
        poem_id: { type: 'string', description: '诗篇 ID（可由 search_poetry 返回）' },
        dimension: { type: 'string', enum: ['译文', '赏析', '全维'], description: '返回维度，默认全维' },
      },
      required: ['poem_id'],
    },
  },
];

function excerptOf(val: unknown, limit = 90): string {
  let arr: unknown = val;
  if (typeof val === 'string') {
    try { arr = JSON.parse(val); } catch { return String(val).slice(0, limit); }
  }
  if (Array.isArray(arr)) {
    return arr.filter((x): x is string => typeof x === 'string').join(' ').slice(0, limit);
  }
  return '';
}

/** 执行 MCP 工具调用：全部读取库内真实数据，返回 MCP content 结构 */
export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  if (name === 'search_poetry') {
    const kw = String(args.keyword ?? '').trim().slice(0, 20);
    if (!kw) return { isError: true, content: [{ type: 'text', text: '缺少必填参数 keyword' }] };
    const dynasty = String(args.dynasty ?? '').trim().slice(0, 8);
    const imagery = String(args.imagery ?? '').trim().slice(0, 1);
    const topK = Math.min(Math.max(Number(args.top_k) || 5, 1), 20);

    const conds: string[] = [];
    const params: unknown[] = [];
    conds.push('(p.title LIKE ? OR p.author LIKE ? OR CAST(p.paragraphs_simp AS CHAR) LIKE ?)');
    params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
    if (dynasty) { conds.push('p.dynasty = ?'); params.push(dynasty); }
    if (imagery) { conds.push('EXISTS(SELECT 1 FROM poem_imagery pi WHERE pi.poem_id = p.id AND pi.imagery_char = ?)'); params.push(imagery); }

    const rows = await prisma.$queryRawUnsafe<{ id: string; title: string; author: string; dynasty: string; paragraphs_simp: unknown }[]>(
      `SELECT p.id, p.title, p.author, p.dynasty, p.paragraphs_simp FROM poems p WHERE ${conds.join(' AND ')} ORDER BY p.id LIMIT ${topK}`,
      ...params,
    );
    if (rows.length === 0) {
      return { content: [{ type: 'text', text: JSON.stringify({ results: [], total: 0 }, null, 2) }] };
    }
    const results = rows.map((r) => ({
      poem_id: r.id, title: r.title, author: r.author, dynasty: r.dynasty, excerpt: excerptOf(r.paragraphs_simp),
    }));
    return { content: [{ type: 'text', text: JSON.stringify({ results, total: results.length }, null, 2) }] };
  }

  if (name === 'get_annotation') {
    const poemId = String(args.poem_id ?? '').trim().slice(0, 36);
    if (!poemId) return { isError: true, content: [{ type: 'text', text: '缺少必填参数 poem_id' }] };
    const dimension = String(args.dimension ?? '全维');
    const row = await prisma.annotation.findUnique({
      where: { poemId },
      include: { poem: { select: { title: true, author: true, dynasty: true } } },
    });
    if (!row) return { isError: true, content: [{ type: 'text', text: `诗篇 ${poemId} 暂无标注数据` }] };
    const data: Record<string, unknown> = {
      poem_id: row.poemId, title: row.poem.title, author: row.poem.author, dynasty: row.poem.dynasty, source: row.source,
    };
    if (dimension === '译文' || dimension === '全维') data.translation = row.fanyi ? row.fanyi.slice(0, 600) : null;
    if (dimension === '赏析' || dimension === '全维') data.appreciation = row.shangxi ? row.shangxi.slice(0, 600) : null;
    if (dimension === '全维') data.notes = row.zhushihui ? row.zhushihui.slice(0, 300) : null;
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: `未知工具 ${name}，可用工具：${MCP_TOOLS.map((t) => t.name).join('、')}` }],
  };
}
