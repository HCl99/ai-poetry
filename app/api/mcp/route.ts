import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { MCP_TOOLS, executeMcpTool } from '@/lib/mcp';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * MCP 端点（演示版·本地模拟调用）：
 * GET  /api/mcp                → 工具清单 manifest（供外部 Agent 发现）
 * POST /api/mcp { name, arguments } → 执行工具，统一响应格式（PRD 9.1）
 */

function requestId() {
  return crypto.randomUUID();
}

export async function GET() {
  return NextResponse.json({
    protocol: 'mcp/1.0-demo',
    server: '墨韵诗心 · 诗词知识库 MCP Server',
    tools: MCP_TOOLS,
    note: '演示版提供工具定义与本地模拟调用；外部第三方 Agent 客户端（如 Claude Desktop）真实联调属 V2 正式版能力',
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ code: 40101, message: '未认证' }, { status: 401 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rl = rateLimit(`mcp:${session.user.id}:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ code: 42901, message: `调用过于频繁，请 ${rl.retryAfterSec} 秒后重试` }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  let body: { name?: string; arguments?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 40001, message: '参数错误：请求体不是合法 JSON' }, { status: 400 });
  }
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ code: 40001, message: '参数错误：缺少工具名 name' }, { status: 400 });
  if (!MCP_TOOLS.some((t) => t.name === name)) {
    return NextResponse.json({ code: 40001, message: `未知工具 ${name}` }, { status: 400 });
  }

  try {
    const result = await executeMcpTool(name, body.arguments ?? {});
    return NextResponse.json({
      code: 0,
      message: result.isError ? '工具执行返回错误' : 'success',
      data: { name, ...result },
      request_id: requestId(),
    });
  } catch (e) {
    console.error('[mcp] 执行失败', name, e);
    return NextResponse.json({ code: 50001, message: '服务端错误：工具执行失败' }, { status: 500 });
  }
}
