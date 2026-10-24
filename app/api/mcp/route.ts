import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { MCP_TOOLS, executeMcpTool } from '@/lib/mcp';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * MCP Server 端点（Model Context Protocol，JSON-RPC 2.0 over HTTP）：
 *   POST /api/mcp                 → MCP 协议入口：initialize / tools/list / tools/call / ping
 *   GET  /api/mcp                 → 工具清单 manifest（供浏览器面板与文档发现）
 *
 * 认证方式二选一：
 *   1. 站内会话（Cookie）——工作台可视化面板使用；
 *   2. `Authorization: Bearer <MCP_API_KEY>` 或 `X-MCP-Key` —— 外部 Agent（Claude Desktop 等）使用。
 * 外部客户端通过 `npx mcp-remote https://<域名>/api/mcp --header "Authorization: Bearer <KEY>"` 接入。
 */

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'moyun-poetry-mcp', version: '1.0.0' };

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { status: 200 });
}

function rpcError(id: JsonRpcId, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } }, { status });
}

/** 外部 Agent 用 API Key 直连时，从环境变量读取期望密钥 */
function hasApiKey(req: NextRequest): boolean {
  const expected = process.env.MCP_API_KEY;
  if (!expected) return false;
  const authz = req.headers.get('authorization') ?? '';
  const token = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : (req.headers.get('x-mcp-key') ?? '').trim();
  return token.length > 0 && token === expected;
}

export async function GET(req: NextRequest) {
  const wantsSse = (req.headers.get('accept') ?? '').includes('text/event-stream');
  if (wantsSse) {
    // 本 Server 为无状态实现，不提供服务端主动推送流；按 Streamable HTTP 规范返回 405 即可
    return NextResponse.json(
      { error: 'SSE stream is not offered by this stateless MCP server; use POST JSON-RPC' },
      { status: 405, headers: { Allow: 'POST' } },
    );
  }
  return NextResponse.json({
    protocol: 'mcp/2025-06-18',
    transport: 'streamable-http (JSON-RPC 2.0 over POST)',
    endpoint: '/api/mcp',
    server: SERVER_INFO,
    tools: MCP_TOOLS,
    auth: 'Cookie session（站内面板）或 Authorization: Bearer <MCP_API_KEY>（外部 Agent）',
    externalClient: 'npx mcp-remote https://<你的域名>/api/mcp --header "Authorization: Bearer <MCP_API_KEY>"',
  });
}

export async function POST(req: NextRequest) {
  const apiKeyAuth = hasApiKey(req);
  const session = apiKeyAuth ? null : await auth();
  if (!apiKeyAuth && !session?.user?.id) {
    return NextResponse.json({ code: 40101, message: '未认证：请登录或提供 MCP_API_KEY' }, { status: 401 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rl = rateLimit(`mcp:${apiKeyAuth ? 'apikey' : session!.user!.id}:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { code: 42901, message: `调用过于频繁，请 ${rl.retryAfterSec} 秒后重试` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error: 请求体不是合法 JSON', 400);
  }

  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return rpcError(body.id ?? null, -32600, 'Invalid Request: 需要 JSON-RPC 2.0 的 method 字段', 400);
  }

  const id = body.id ?? null;
  const method = body.method;
  const params = body.params ?? {};

  // 通知类消息（无 id）按规范返回 202，不产生响应体
  if (method.startsWith('notifications/')) {
    return new NextResponse(null, { status: 202 });
  }

  try {
    switch (method) {
      case 'initialize': {
        const requested = String(params.protocolVersion ?? '');
        const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
        return rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: '墨韵诗心诗词知识库：可检索 33 万首中华诗词，并读取库内译文/赏析/注释。',
        });
      }
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list':
        return rpcResult(id, { tools: MCP_TOOLS });
      case 'tools/call': {
        const name = String(params.name ?? '').trim();
        if (!MCP_TOOLS.some((t) => t.name === name)) {
          return rpcError(id, -32602, `Invalid params: 未知工具 ${name || '(空)'}`);
        }
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        const result = await executeMcpTool(name, args);
        return rpcResult(id, result);
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    console.error('[mcp] 执行失败', method, e);
    return rpcError(id, -32603, 'Internal error: 工具执行失败', 500);
  }
}
