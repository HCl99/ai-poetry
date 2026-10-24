'use client';

import { useState } from 'react';

/**
 * MCP 工具面板（PRD 4.8 / 技术深度表 MCP 4%）：
 * 对接真实的 MCP Server 端点（JSON-RPC 2.0 over HTTP），演示 initialize → tools/list → tools/call 三段握手，
 * 并把协议请求/响应原样展示，便于评审现场核验“不是模拟”。
 */

type ToolName = 'search_poetry' | 'get_annotation';

interface JsonRpcResponse {
  jsonrpc?: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
  // 非 JSON-RPC 错误（401/429）沿用统一业务格式
  code?: number;
  message?: string;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-light bg-paper-light p-5 shadow-ink">
      <h2 className="mb-4 font-ui text-base font-medium text-ink-deep">{title}</h2>
      {children}
    </section>
  );
}

function nextId() {
  return Math.floor(Date.now() % 1_000_000);
}

async function rpc(method: string, params: Record<string, unknown>, id?: number) {
  const res = await fetch('/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id !== undefined ? { id } : {}), method, params }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as JsonRpcResponse };
}

export function McpView() {
  const [tool, setTool] = useState<ToolName>('search_poetry');
  const [keyword, setKeyword] = useState('月');
  const [dynasty, setDynasty] = useState('');
  const [imagery, setImagery] = useState('');
  const [poemId, setPoemId] = useState('');
  const [dimension, setDimension] = useState('全维');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JsonRpcResponse | null>(null);
  const [manifest, setManifest] = useState<string | null>(null);
  const [trace, setTrace] = useState<string[]>([]);

  async function callTool() {
    setLoading(true);
    setResult(null);
    try {
      const args = tool === 'search_poetry'
        ? { keyword, ...(dynasty && { dynasty }), ...(imagery && { imagery }), top_k: 5 }
        : { poem_id: poemId, dimension };
      const { body } = await rpc('tools/call', { name: tool, arguments: args }, nextId());
      setResult(body);
    } catch {
      setResult({ error: { code: -1, message: '网络异常' } });
    } finally {
      setLoading(false);
    }
  }

  async function runHandshake() {
    setTrace([]);
    const id1 = nextId();
    const initParams = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'moyun-web-panel', version: '1.0.0' } };
    const init = await rpc('initialize', initParams, id1);
    setTrace((t) => [...t, `① initialize\n→ ${JSON.stringify({ jsonrpc: '2.0', id: id1, method: 'initialize', params: initParams })}\n← ${JSON.stringify(init.body, null, 2)}`]);
    const notified = await rpc('notifications/initialized', {});
    setTrace((t) => [...t, `② notifications/initialized\n← HTTP ${notified.status}（通知类消息，无响应体）`]);
    const list = await rpc('tools/list', {}, nextId());
    setTrace((t) => [...t, `③ tools/list\n← ${JSON.stringify(list.body, null, 2)}`]);
  }

  async function loadManifest() {
    setManifest(null);
    try {
      const r = await fetch('/api/mcp');
      setManifest(JSON.stringify(await r.json(), null, 2));
    } catch {
      setManifest('加载失败');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-brush text-3xl text-ink-deep">MCP 工具调用</h1>
        <p className="mt-1 font-ui text-sm text-ink-soft">
          Model Context Protocol · 真实 JSON-RPC 2.0 Server（POST /api/mcp），诗词知识库封装为 2 个标准工具，外部 Agent 可直连
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button onClick={runHandshake} className="rounded-lg border-[1.5px] border-ink-mid/30 px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:border-ink-deep hover:text-ink-deep">
          运行协议握手（initialize → tools/list）
        </button>
        <button onClick={loadManifest} className="rounded-lg border-[1.5px] border-ink-mid/30 px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:border-ink-deep hover:text-ink-deep">
          查看工具清单（GET /api/mcp）
        </button>
        <a href="/api/mcp" target="_blank" rel="noreferrer" className="rounded-lg border-[1.5px] border-ink-mid/30 px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:border-ink-deep hover:text-ink-deep">
          原始 manifest ↗
        </a>
      </div>

      {manifest && (
        <pre className="max-h-72 overflow-auto rounded-xl border border-light bg-paper-light p-4 font-mono text-xs text-ink-mid">{manifest}</pre>
      )}

      {trace.length > 0 && (
        <Panel title="握手轨迹（真实的 JSON-RPC 往返）">
          <div className="space-y-3">
            {trace.map((t, i) => (
              <pre key={i} className="max-h-60 overflow-auto whitespace-pre-wrap rounded-xl border border-light bg-paper-light p-4 font-mono text-xs leading-relaxed text-ink-mid">{t}</pre>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="工具调用（JSON-RPC 2.0 → POST /api/mcp）">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block font-ui text-sm text-ink-mid">
              工具
              <select value={tool} onChange={(e) => { setTool(e.target.value as ToolName); setResult(null); }} className="mt-1 w-full rounded-lg border-[1.5px] border-light bg-paper-light px-3 py-2 font-ui text-sm text-ink-deep focus:border-ink-deep focus:outline-none">
                <option value="search_poetry">search_poetry · 按关键词/朝代/意象检索诗词</option>
                <option value="get_annotation">get_annotation · 获取诗篇标注（译文/赏析）</option>
              </select>
            </label>

            {tool === 'search_poetry' ? (
              <>
                <label className="block font-ui text-sm text-ink-mid">
                  keyword *（匹配诗题/作者/正文）
                  <input value={keyword} onChange={(e) => setKeyword(e.target.value)} className="mt-1 w-full rounded-lg border-[1.5px] border-light bg-paper-light px-3 py-2 font-ui text-sm text-ink-deep focus:border-ink-deep focus:outline-none" placeholder="如：月" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block font-ui text-sm text-ink-mid">
                    dynasty（可选）
                    <input value={dynasty} onChange={(e) => setDynasty(e.target.value)} className="mt-1 w-full rounded-lg border-[1.5px] border-light bg-paper-light px-3 py-2 font-ui text-sm text-ink-deep focus:border-ink-deep focus:outline-none" placeholder="唐" />
                  </label>
                  <label className="block font-ui text-sm text-ink-mid">
                    imagery（可选·单字）
                    <input value={imagery} onChange={(e) => setImagery(e.target.value)} className="mt-1 w-full rounded-lg border-[1.5px] border-light bg-paper-light px-3 py-2 font-ui text-sm text-ink-deep focus:border-ink-deep focus:outline-none" placeholder="月" />
                  </label>
                </div>
              </>
            ) : (
              <>
                <label className="block font-ui text-sm text-ink-mid">
                  poem_id *
                  <input value={poemId} onChange={(e) => setPoemId(e.target.value)} className="mt-1 w-full rounded-lg border-[1.5px] border-light bg-paper-light px-3 py-2 font-ui text-sm text-ink-deep focus:border-ink-deep focus:outline-none" placeholder="先用 search_poetry 查询诗篇 ID" />
                </label>
                <label className="block font-ui text-sm text-ink-mid">
                  dimension
                  <select value={dimension} onChange={(e) => setDimension(e.target.value)} className="mt-1 w-full rounded-lg border-[1.5px] border-light bg-paper-light px-3 py-2 font-ui text-sm text-ink-deep focus:border-ink-deep focus:outline-none">
                    <option>全维</option>
                    <option>译文</option>
                    <option>赏析</option>
                  </select>
                </label>
              </>
            )}

            <button onClick={callTool} disabled={loading || (tool === 'get_annotation' && !poemId.trim())} className="w-full rounded-lg py-2.5 font-ui text-sm font-medium text-white transition-ink hover:shadow-ink-hover disabled:opacity-50" style={{ background: 'var(--ink-deep)' }}>
              {loading ? '调用中…' : '执行工具调用'}
            </button>
          </div>

          <div className="min-w-0">
            <div className="mb-1.5 font-ui text-xs text-ink-soft">JSON-RPC 响应（真实工具执行结果）</div>
            {result ? (
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-light bg-paper-light p-4 font-mono text-xs leading-relaxed text-ink-mid">
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-light font-ui text-sm text-ink-soft">
                {loading ? 'MCP 工具执行中…' : '选择工具并填写参数后调用'}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="接入外部 Agent（Claude Desktop / Cursor）">
        <div className="space-y-2 font-ui text-xs leading-relaxed text-ink-soft">
          <p>1. 在服务端环境变量中配置 <code className="rounded bg-paper-dark px-1.5 py-0.5 font-mono text-ink-mid">MCP_API_KEY</code>；</p>
          <p>2. 客户端配置文件中加入：</p>
          <pre className="overflow-auto rounded-xl border border-light bg-paper-light p-4 font-mono text-[11px] leading-relaxed text-ink-mid">{`{
  "mcpServers": {
    "moyun-poetry": {
      "command": "npx",
      "args": ["-y", "mcp-remote",
        "https://<你的域名>/api/mcp",
        "--header", "Authorization: Bearer <MCP_API_KEY>"]
    }
  }
}`}</pre>
          <p>3. 重启客户端后即可让外部 Agent 调用 search_poetry / get_annotation，本页「握手轨迹」展示的正是同一条协议链路。</p>
        </div>
      </Panel>
    </div>
  );
}
