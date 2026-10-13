'use client';

import { useState } from 'react';

/**
 * MCP 工具演示面板（PRD 4.8 / 技术深度表 MCP 4%）：
 * 可视化调用 search_poetry / get_annotation 两个 MCP 工具，
 * 展示协议定义（manifest）与统一响应格式。
 */

type ToolName = 'search_poetry' | 'get_annotation';

interface McpResult {
  code: number;
  message: string;
  data?: { name: string; content: { type: string; text: string }[]; isError?: boolean };
  request_id?: string;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-light bg-paper-light p-5 shadow-ink">
      <h2 className="mb-4 font-ui text-base font-medium text-ink-deep">{title}</h2>
      {children}
    </section>
  );
}

export function McpView() {
  const [tool, setTool] = useState<ToolName>('search_poetry');
  const [keyword, setKeyword] = useState('月');
  const [dynasty, setDynasty] = useState('');
  const [imagery, setImagery] = useState('');
  const [poemId, setPoemId] = useState('');
  const [dimension, setDimension] = useState('全维');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<McpResult | null>(null);
  const [manifest, setManifest] = useState<string | null>(null);

  async function callTool() {
    setLoading(true);
    setResult(null);
    try {
      const args = tool === 'search_poetry'
        ? { keyword, ...(dynasty && { dynasty }), ...(imagery && { imagery }), top_k: 5 }
        : { poem_id: poemId, dimension };
      const r = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tool, arguments: args }),
      });
      setResult(await r.json());
    } catch {
      setResult({ code: -1, message: '网络异常' });
    } finally {
      setLoading(false);
    }
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
          Model Context Protocol · 诗词知识库已封装为 2 个标准工具，供外部 Agent（如 Claude Desktop）通过 MCP 协议调用
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
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

      <Panel title="本地模拟调用（POST /api/mcp）">
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
            <div className="mb-1.5 font-ui text-xs text-ink-soft">统一响应（PRD 9.1 格式：code / message / data / request_id）</div>
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

      <p className="font-ui text-xs text-ink-soft">
        演示版说明：本页为 MCP 工具的本地模拟调用演示；工具协议定义完整，外部第三方 Agent 客户端真实联调属 V2 正式版规划（PRD 4.8 边界声明）。
      </p>
    </div>
  );
}
