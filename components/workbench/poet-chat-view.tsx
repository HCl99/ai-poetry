'use client';

import { useEffect, useRef, useState } from 'react';
import { MessagesSquare, Search, RefreshCcw } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { sseEvents } from '@/lib/sse';

interface PoetItem { name: string; dynasty: string; intro: string; degree?: number }
interface Msg { role: 'user' | 'assistant'; content: string }

const QUICK_QS = [
  '你生平最得意的是哪部作品？',
  '给后学一点学诗的建议吧',
  '你的诗里最常出现什么意象？',
];

export function PoetChatView() {
  const [poets, setPoets] = useState<PoetItem[]>([]);
  const [q, setQ] = useState('');
  const [poet, setPoet] = useState<PoetItem | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { msg, show } = useToast();

  useEffect(() => {
    fetch('/api/poets/list')
      .then((r) => r.json())
      .then(setPoets)
      .catch(() => show('诗人列表加载失败'));
    return () => abortRef.current?.abort();
  }, []);

  async function search() {
    try {
      const r = await fetch(`/api/poets/list?q=${encodeURIComponent(q.trim())}`);
      const list: PoetItem[] = await r.json();
      setPoets(list);
      if (!list.length) show(`未找到名为「${q.trim()}」的诗人`);
    } catch {
      show('搜索失败，请重试');
    }
  }

  function pick(p: PoetItem) {
    abortRef.current?.abort();
    setPoet(p);
    setMsgs([]);
    setInput('');
  }

  const scrollDown = () => setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 60);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!poet || !content || thinking) return;
    setInput('');
    const next: Msg[] = [...msgs, { role: 'user', content }, { role: 'assistant', content: '' }];
    setMsgs(next);
    setThinking(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = '';
    const updateLast = (patch: Partial<Msg>) =>
      setMsgs((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, ...patch } : m)));
    try {
      const r = await fetch('/api/poet-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poet: poet.name, message: content, history: msgs }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || '对话失败');
      }
      for await (const { event, data } of sseEvents(r)) {
        if (event === 'delta') {
          acc += data.text || '';
          updateLast({ content: acc });
          scrollDown();
        } else if (event === 'error') {
          throw new Error(data.error || '对话失败');
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') { updateLast({ content: acc || '（已停止）' }); show('已停止对话'); return; }
      updateLast({ content: acc || `（${e?.message || '生成失败，请重试'}）` });
    } finally {
      setThinking(false);
      scrollDown();
    }
  }

  /* ---- 诗人选择 ---- */
  if (!poet) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 font-brush text-3xl text-ink-black">
            <MessagesSquare className="h-7 w-7 text-muted-blue" /> 诗人对话
          </h1>
          <p className="mt-1.5 font-ui text-sm text-ink-soft">
            基于诗人小传与库内作品构建人设（Persona RAG），与李白、苏轼们隔空对谈——所谈作品全部来自诗库，杜绝杜撰
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"><Search className="h-4 w-4" /></span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) search(); }}
              placeholder="搜索诗人姓名，如：王维、李清照…"
              className="h-11 w-full rounded-lg border-[1.5px] border-c bg-white/70 pl-10 pr-3 font-ui text-sm outline-none transition-ink focus:border-ink-deep"
            />
          </div>
          <button onClick={search} className="h-11 shrink-0 rounded-lg px-5 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5" style={{ background: 'var(--btn-grad)', color: '#fff' }}>
            搜索
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {poets.map((p) => (
            <button key={p.name} onClick={() => pick(p)} className="paper-card paper-card-hover p-5 text-left">
              <div className="flex items-center justify-between">
                <span className="font-brush text-2xl text-ink-deep">{p.name}</span>
                <span className="dynasty-tag dynasty-tang">{p.dynasty}</span>
              </div>
              <p className="mt-2 line-clamp-2 font-ui text-xs leading-relaxed text-ink-soft">{p.intro || '暂无小传'}</p>
            </button>
          ))}
          {poets.length === 0 && (
            <p className="col-span-full py-10 text-center font-ui text-sm text-ink-soft">没有匹配的诗人，换个名字试试</p>
          )}
        </div>
        <Toast msg={msg} />
      </div>
    );
  }

  /* ---- 对话中 ---- */
  return (
    <div className="space-y-4">
      {/* 诗人名片 */}
      <div className="paper-card flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-brush text-2xl text-white shadow-ink" style={{ background: 'var(--brand-grad)' }}>{poet.name[0]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-brush text-2xl text-ink-deep">{poet.name}</span>
            <span className="dynasty-tag dynasty-tang">{poet.dynasty}</span>
          </div>
          <p className="mt-0.5 line-clamp-1 font-ui text-xs text-ink-soft">{poet.intro || '与你对谈'}</p>
        </div>
        <button onClick={() => { abortRef.current?.abort(); setPoet(null); }} className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3.5 py-2 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark">
          <RefreshCcw className="h-3.5 w-3.5" /> 切换诗人
        </button>
      </div>

      {/* 对话区 */}
      <div className="paper-card p-6">
        <div ref={listRef} className="max-h-[440px] space-y-4 overflow-y-auto pr-1">
          {msgs.length === 0 && (
            <div className="py-8 text-center">
              <p className="font-brush text-xl text-ink-deep">「{poet.name}」已候多时</p>
              <p className="mt-1 font-ui text-xs text-ink-soft">向他提问，或选一个话题开始</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {QUICK_QS.map((c) => (
                  <button key={c} onClick={() => send(c)} className="rounded-full border border-c bg-white/70 px-3.5 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark">
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <span className="mr-2 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-brush text-sm text-white" style={{ background: 'var(--brand-grad)' }}>{poet.name[0]}</span>
              )}
              <div
                className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 font-ui text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                style={m.role === 'user'
                  ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' }
                  : { background: 'var(--paper-light)', border: '1px solid var(--border-light)', color: 'var(--ink-deep)' }}
              >
                {m.content || (thinking && i === msgs.length - 1 ? <span className="inline-block spinner spinner-ink" style={{ width: 14, height: 14 }} /> : '')}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) send(); }}
            disabled={thinking}
            placeholder={`与「${poet.name}」对话…（Enter 发送，Esc 停止）`}
            className="h-11 min-w-0 flex-1 rounded-lg border-[1.5px] border-c bg-white/70 px-3.5 font-ui text-sm outline-none transition-ink focus:border-ink-deep disabled:opacity-60"
          />
          <button
            onClick={() => (thinking ? abortRef.current?.abort() : send())}
            disabled={!thinking && !input.trim()}
            className="h-11 shrink-0 rounded-lg px-6 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
            style={thinking ? { background: 'var(--rose)', color: '#fff' } : { background: 'var(--btn-grad)', color: '#fff' }}
          >
            {thinking ? '停止' : '发送'}
          </button>
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
