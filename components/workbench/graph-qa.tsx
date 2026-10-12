'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircleQuestion, Send, Square, Database } from 'lucide-react';
import { sseEvents } from '@/lib/sse';

const KIND_META = {
  poet: {
    hint: (f: string) => `围绕「${f}」提问，AI 仅依据图谱中的真实互提关系作答`,
    quick: (f: string) => [
      `「${f}」与哪些诗人交往最密切？`,
      `「${f}」对后世诗人有何影响？`,
      `和「${f}」互提最多的是谁？`,
    ],
  },
  imagery: {
    hint: (f: string) => `围绕意象「${f}」提问，AI 仅依据共现数据与真实诗例作答`,
    quick: (f: string) => [
      `意象「${f}」常与哪些意象共现？`,
      `「${f}」承载了哪些情感？`,
      `哪些诗中出现过「${f}」？`,
    ],
  },
} as const;

/** 图谱问答面板（GraphRAG）：两个图谱页共用，随焦点切换上下文 */
export function GraphQaPanel({ kind, focus }: { kind: 'poet' | 'imagery'; focus: string }) {
  const meta = KIND_META[kind];
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [context, setContext] = useState<string[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // 切换焦点诗人/意象时清空旧问答
  useEffect(() => {
    abortRef.current?.abort();
    setQuestion('');
    setAnswer('');
    setContext([]);
    setLatency(null);
    setError('');
    setInput('');
  }, [focus]);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [answer, busy]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setQuestion(q.trim());
    setAnswer('');
    setContext([]);
    setLatency(null);
    setError('');
    try {
      const r = await fetch('/api/graph-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, question: q.trim() }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || '图谱问答失败');
      }
      for await (const { event, data } of sseEvents(r)) {
        if (event === 'delta') setAnswer((a) => a + (data.text || ''));
        else if (event === 'done') {
          setContext(data.context || []);
          setLatency(data.latencyMs ?? null);
        } else if (event === 'error') throw new Error(data.error || '图谱问答失败');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e?.message || '图谱问答失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="paper-card overflow-hidden">
      {/* 折叠头 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-ink hover:bg-[var(--inset)]"
      >
        <span className="flex items-center gap-2.5">
          <MessageCircleQuestion className="h-4.5 w-4.5 text-muted-blue" style={{ height: 18, width: 18 }} />
          <span>
            <span className="font-ui text-[15px] font-medium text-ink-deep">图谱问答 · GraphRAG</span>
            <span className="ml-2 font-ui text-xs text-ink-soft">从可视化到可问答，仅依据图谱真实数据作答</span>
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-ink-soft" /> : <ChevronDown className="h-4 w-4 text-ink-soft" />}
      </button>

      {open && (
        <div className="space-y-4 border-t border-[#E4DFD4] px-5 pb-5 pt-4">
          <p className="font-ui text-xs text-ink-soft">{meta.hint(focus)}</p>

          {/* 问答记录（单轮：问题 + 流式回答） */}
          {question && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-xl rounded-br-sm px-3.5 py-2 font-ui text-sm" style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}>
                {question}
              </div>
            </div>
          )}
          {(answer || busy || error) && (
            <div ref={boxRef} className="max-h-60 overflow-y-auto rounded-xl rounded-bl-sm px-3.5 py-2.5" style={{ background: 'var(--inset)' }}>
              {error ? (
                <span className="font-ui text-sm text-[#A67C7C]">{error}</span>
              ) : (
                <span className="font-ui text-sm leading-relaxed text-ink-mid">
                  {answer}
                  {busy && <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse rounded-sm" style={{ background: '#7B8EA1' }} />}
                </span>
              )}
            </div>
          )}

          {/* 引用依据：图谱子图数据 */}
          {!busy && context.length > 0 && (
            <div className="rounded-lg p-3" style={{ background: 'rgba(107,142,123,0.10)', border: '1px solid rgba(107,142,123,0.25)' }}>
              <div className="mb-1.5 flex items-center gap-1.5 font-ui text-xs font-medium" style={{ color: '#4E6E5D' }}>
                <Database style={{ height: 13, width: 13 }} />
                依据图谱数据 · {latency != null ? `${latency}ms` : ''}
              </div>
              <ul className="space-y-1">
                {context.map((c, i) => (
                  <li key={i} className="font-ui text-xs leading-relaxed" style={{ color: '#5E7A6A' }}>· {c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 快捷问题 */}
          <div className="flex flex-wrap gap-2">
            {meta.quick(focus).map((q) => (
              <button
                key={q}
                disabled={busy}
                onClick={() => ask(q)}
                className="rounded-full px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:text-ink-deep disabled:opacity-50"
                style={{ background: 'var(--inset)' }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* 输入行 */}
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) ask(input);
              }}
              placeholder={`向图谱提问，如：${meta.quick(focus)[0]}`}
              disabled={busy}
              className="min-w-0 flex-1 rounded-lg px-3.5 py-2 font-ui text-sm outline-none transition-ink focus:ring-1 focus:ring-muted-blue/40 disabled:opacity-60"
              style={{ background: 'var(--inset)', color: 'var(--ink-deep, #3A3835)' }}
            />
            {busy ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 font-ui text-sm transition-ink"
                style={{ background: 'var(--inset)', color: '#A67C7C' }}
              >
                <Square style={{ height: 13, width: 13 }} /> 停止
              </button>
            ) : (
              <button
                onClick={() => ask(input)}
                disabled={!input.trim()}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 font-ui text-sm transition-ink disabled:opacity-50"
                style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
              >
                <Send style={{ height: 13, width: 13 }} /> 提问
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
