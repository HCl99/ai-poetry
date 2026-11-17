'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, Check, ChevronDown, Loader2, Menu, Plus, Send, Sparkles, Square, Trash2, X } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { VoiceInputButton } from '@/components/voice-input-button';
import { sseEvents } from '@/lib/sse';

interface Related { id: string; title: string; author: string; dynasty: string; score: number | null }
interface Step { label: string; detail: string; phase?: string }
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  steps?: Step[];
  related?: Related[];
  citations?: string[];
  invalidCitations?: string[];
  latencyMs?: number;
  error?: string;
  stopped?: boolean;
}
interface Conversation { id: string; title: string; createdAt: string; messages: ChatMsg[] }

const STORE_KEY = 'assistant-conversations';

const QUICK_ASKS = [
  '李白的《静夜思》表达了怎样的情感？',
  '“明月”意象在唐诗中有哪些经典用法？',
  '帮我写一首描写春天的七言绝句',
  '“春风又绿江南岸”的“绿”字好在哪里？',
  '推荐几首适合中秋读的古诗',
  '为什么苏东坡的词风格与柳永不同？',
  '解释一下"采菊东篱下，悠然见南山"',
  '唐诗和宋词在形式上有什么区别？',
];

/** Agent 工作流的四个阶段（与服务端 SSE step 事件一一对应） */
const AGENT_PHASES = [
  { key: 'understand', short: '理解', label: '理解问题' },
  { key: 'retrieve', short: '检索', label: '检索诗词知识库' },
  { key: 'rerank', short: '精排', label: 'CrossEncoder 精排' },
  { key: 'generate', short: '生成', label: '组织回答' },
];

function loadConversations(): Conversation[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveConversations(list: Conversation[]) {
  try {
    // 只保留每个会话最近 40 条消息，避免长会话把 localStorage（约 5MB）写满后静默丢失
    const slim = list.slice(0, 20).map((c) => ({ ...c, messages: c.messages.slice(-40) }));
    localStorage.setItem(STORE_KEY, JSON.stringify(slim));
  } catch (e) {
    console.warn('[assistant] 历史保存失败（可能已超出本地存储配额）', e);
  }
}

export function AssistantView() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stepsOpen, setStepsOpen] = useState<Record<number, boolean>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { msg, show } = useToast();

  useEffect(() => {
    // 仅加载会话列表到侧边栏，不自动选中任何历史会话——
    // 每次进入 AI 助手默认是「新对话」状态（欢迎页 + 快捷提问），
    // 历史会话收在左侧边栏，用户主动点击才展开
    const list = loadConversations();
    setConvs(list);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function persist(next: ChatMsg[], id?: string, title?: string) {
    const cid = id || activeId;
    if (!cid) return;
    setConvs((list) => {
      const idx = list.findIndex((c) => c.id === cid);
      if (idx === -1) return list;
      const copy = [...list];
      copy[idx] = { ...copy[idx], messages: next };
      saveConversations(copy);
      return copy;
    });
  }

  function newChat() {
    if (busy) return;
    setActiveId(null);
    setMessages([]);
    setStepsOpen({});
    setDrawerOpen(false);
  }

  function openConv(c: Conversation) {
    if (busy) return;
    setActiveId(c.id);
    setMessages(c.messages);
    setStepsOpen({});
    setDrawerOpen(false);
  }

  function removeConv(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const next = convs.filter((c) => c.id !== id);
    setConvs(next);
    saveConversations(next);
    if (activeId === id) newChat();
  }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');

    // 新会话：先落库
    let cid = activeId;
    let base = messages;
    if (!cid) {
      cid = `${Date.now()}`;
      const conv: Conversation = { id: cid, title: q.slice(0, 24), createdAt: new Date().toISOString(), messages: [] };
      const next = [conv, ...convs];
      setConvs(next);
      saveConversations(next);
      setActiveId(cid);
      base = [];
    }

    const history = base.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    const userMsg: ChatMsg = { role: 'user', content: q };
    const aMsg: ChatMsg = { role: 'assistant', content: '', steps: [] };
    let current: ChatMsg[] = [...base, userMsg, aMsg];
    setMessages(current);
    setBusy(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || '请求失败');
      }
      for await (const { event, data } of sseEvents(r)) {
        const idx = current.length - 1;
        const a = { ...current[idx] };
        if (event === 'step') a.steps = [...(a.steps || []), data];
        else if (event === 'delta') a.content += data.text || '';
        else if (event === 'meta') a.related = data.related;
        else if (event === 'done') {
          a.citations = data.citations;
          a.invalidCitations = data.invalidCitations;
          a.latencyMs = data.latencyMs;
        } else if (event === 'error') a.error = data.error || '生成失败';
        current = [...current.slice(0, idx), a];
        setMessages(current);
      }
    } catch (e: any) {
      const idx = current.length - 1;
      if (e?.name !== 'AbortError') {
        show(e?.message || '网络异常，请重试');
        current = [...current.slice(0, idx), { ...current[idx], error: e?.message || '生成失败' }];
      } else {
        // 用户主动停止：保留已生成的部分，并明确标注，避免看起来像回答被截断
        current = [...current.slice(0, idx), { ...current[idx], stopped: true }];
      }
      setMessages(current);
    } finally {
      setBusy(false);
      abortRef.current = null;
      persist(current, cid!);
    }
  }

  const active = convs.find((c) => c.id === activeId);

  return (
    <div className="relative flex h-[calc(100vh-9.5rem)] gap-5">
      {/* 移动端遮罩 */}
      {drawerOpen && (
        <button
          className="absolute inset-0 z-20 bg-black/25 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-label="关闭会话历史"
        />
      )}
      {/* 会话历史：md 以下改为抽屉，移动端也能新建/切换会话 */}
      <aside
        className={`${drawerOpen ? 'flex' : 'hidden'} absolute inset-y-0 left-0 z-30 w-64 flex-col rounded-xl p-3 md:static md:z-auto md:flex md:w-60 md:rounded-none md:p-0`}
        style={{ background: 'var(--paper)' }}
      >
        <div className="mb-2 flex items-center justify-between md:hidden">
          <span className="font-ui text-xs text-ink-soft">会话历史</span>
          <button onClick={() => setDrawerOpen(false)} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={newChat}
          disabled={busy}
          className="mb-3 flex items-center justify-center gap-2 rounded-xl py-2.5 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 disabled:opacity-50"
          style={{ background: 'var(--btn-grad)' }}
        >
          <Plus className="h-4 w-4" /> 新对话
        </button>
        <div className="paper-card min-h-0 flex-1 overflow-y-auto p-2">
          {convs.length === 0 ? (
            <p className="p-4 text-center font-ui text-xs text-ink-soft">暂无历史会话</p>
          ) : (
            convs.map((c) => (
              <button
                key={c.id}
                onClick={() => openConv(c)}
                className="group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-ink hover:bg-[rgba(107,142,123,0.08)]"
                style={activeId === c.id ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' } : undefined}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-ui text-xs" style={activeId === c.id ? undefined : { color: 'var(--ink-deep)' }}>{c.title}</span>
                  <span className="block font-ui text-[10px] text-ink-soft">{new Date(c.createdAt).toLocaleDateString()}</span>
                </span>
                <Trash2 className="h-3.5 w-3.5 shrink-0 text-ink-soft opacity-0 transition-ink group-hover:opacity-100" onClick={(e) => removeConv(e, c.id)} />
              </button>
            ))
          )}
        </div>
      </aside>

      {/* 对话主区 */}
      <section className="paper-card flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2.5 border-b border-light px-5 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: 'var(--brand-grad)' }}>
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-ui text-[15px] font-medium leading-tight text-ink-deep">AI 助手</h1>
            <p className="font-ui text-[11px] leading-tight text-ink-soft">自由对话 · 诗词知识库随时参考</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {active && <span className="hidden truncate font-ui text-xs text-ink-soft sm:block">{active.title}</span>}
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg border border-c p-1.5 text-ink-soft transition-ink hover:text-ink-deep md:hidden"
              aria-label="打开会话历史"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              onClick={newChat}
              disabled={busy}
              className="rounded-lg border border-c p-1.5 text-ink-soft transition-ink hover:text-ink-deep disabled:opacity-40 md:hidden"
              aria-label="新对话"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-8">
              <span className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-ink" style={{ background: 'var(--brand-grad)' }}>
                <Sparkles className="h-7 w-7" />
              </span>
              <p className="mt-4 font-brush text-2xl text-ink-deep">随心而问 · 答无定界</p>
              <p className="mt-1 font-ui text-sm text-ink-soft">诗词、文学、生活、创作…都可以聊</p>
              <div className="mt-6 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                {QUICK_ASKS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="rounded-xl border border-c px-4 py-3 text-left font-ui text-xs leading-relaxed text-ink-mid transition-ink hover:bg-paper-dark"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 font-ui text-sm leading-relaxed text-white" style={{ background: 'var(--btn-bg)' }}>
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[85%] space-y-2">
                        {/* 工作流阶段由服务端下发的 phase 字段驱动（不再匹配中文文案） */}
                        {(m.steps?.length || (busy && i === messages.length - 1)) && (() => {
                          const streaming = busy && i === messages.length - 1;
                          const phases = new Set((m.steps || []).map((s) => s.phase).filter(Boolean) as string[]);
                          const skippedRerank = phases.has('retrieved') && !phases.has('rerank');
                          const done = [
                            phases.has('understand'),
                            phases.has('retrieve'),
                            skippedRerank || phases.has('rerank'),
                            phases.has('generate') || (!streaming && !!m.content),
                          ];
                          const activeIdx = done.findIndex((d) => !d);
                          const lastStep = m.steps?.[m.steps.length - 1];
                          return (
                        <div className="rounded-xl border border-light p-2.5" style={{ background: 'var(--inset)' }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-ui text-[10px] tracking-widest text-ink-soft">AGENT 工作流</span>
                            <button
                              onClick={() => setStepsOpen((s) => ({ ...s, [i]: !s[i] }))}
                              className="flex items-center gap-1 font-ui text-[10px] text-ink-soft transition-ink hover:text-ink-mid"
                              aria-expanded={!!stepsOpen[i]}
                            >
                              调用轨迹
                              <ChevronDown className={`h-3 w-3 transition-transform ${stepsOpen[i] ? 'rotate-180' : ''}`} />
                            </button>
                          </div>

                          <div className="mt-2 flex items-start">
                            {AGENT_PHASES.map((p, j) => {
                              // 精排阶段仅在真正走了 CrossEncoder 时才算完成，向量服务降级时标记为跳过
                              const skipped = j === 2 && skippedRerank;
                              const state: 'done' | 'active' | 'idle' | 'skip' = skipped
                                ? 'skip'
                                : done[j]
                                  ? 'done'
                                  : j === activeIdx && streaming
                                    ? 'active'
                                    : 'idle';
                              return (
                                <div key={p.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                                  <span
                                    className="flex h-5 w-5 items-center justify-center rounded-full font-ui text-[10px] leading-none"
                                    title={skipped ? `${p.label} · 本次未启用（关键词降级）` : p.label}
                                    style={{
                                      background: state === 'done' ? 'rgba(107,142,123,0.16)' : state === 'active' ? 'var(--btn-bg)' : 'transparent',
                                      color: state === 'done' ? '#4E6E5D' : state === 'active' ? '#FFFFFF' : 'var(--ink-soft)',
                                      border: state === 'idle' ? '1px dashed var(--border-c)' : '1px solid transparent',
                                      opacity: state === 'skip' ? 0.45 : 1,
                                    }}
                                  >
                                    {state === 'done' ? <Check className="h-3 w-3" /> : state === 'active' ? <Loader2 className="h-3 w-3 animate-spin" /> : state === 'skip' ? '–' : j + 1}
                                  </span>
                                  <span className="truncate font-ui text-[10px] text-ink-soft">{p.short}</span>
                                </div>
                              );
                            })}
                          </div>

                          {lastStep && (
                            <p className="mt-2 truncate font-ui text-[10px] text-ink-soft">
                              {streaming ? '正在：' : '末步：'}{lastStep.label}{lastStep.detail ? ` · ${lastStep.detail}` : ''}
                            </p>
                          )}

                          {stepsOpen[i] && m.steps && (
                            <div className="mt-2 space-y-1 border-t border-light pt-2">
                              {m.steps.map((s, j) => (
                                <div key={j} className="flex gap-1.5 font-ui text-[10px] leading-relaxed text-ink-soft">
                                  <span className="shrink-0 font-mono opacity-60">{String(j + 1).padStart(2, '0')}</span>
                                  <span className="min-w-0 break-words">
                                    {s.label}{s.detail ? ` · ${s.detail}` : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {/* 回答正文 */}
                    {m.content && (
                      <div className="rounded-2xl rounded-bl-md px-4 py-3 font-ui text-sm leading-relaxed text-ink-deep" style={{ background: 'var(--inset)', whiteSpace: 'pre-line' }}>
                        {m.content}
                      </div>
                    )}
                    {m.error && (
                      <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 font-ui text-xs" style={{ background: 'rgba(166,124,124,0.1)', color: '#A67C7C' }}>
                        <span className="min-w-0 flex-1">{m.error}</span>
                        {(() => {
                          const prev = messages.slice(0, i).reverse().find((x) => x.role === 'user');
                          return prev ? (
                            <button
                              onClick={() => {
                                setInput(prev.content);
                                setMessages((list) => list.filter((_, k) => k !== i));
                              }}
                              className="shrink-0 rounded-full px-2.5 py-0.5 font-ui text-[10px] transition-ink"
                              style={{ border: '1px solid #A67C7C' }}
                            >
                              重试
                            </button>
                          ) : null;
                        })()}
                      </div>
                    )}
                    {m.stopped && (
                      <p className="font-ui text-[10px] text-ink-soft">已停止生成</p>
                    )}
                    {/* RAG 引用溯源 */}
                    {m.related && m.related.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-ui text-[10px] text-ink-soft">RAG 来源：</span>
                        {m.related.slice(0, 5).map((r) => (
                          <Link
                            key={r.id}
                            href={`/workbench/explore?q=${encodeURIComponent(r.title)}`}
                            title={`检索自知识库：〔${r.dynasty}〕${r.author}`}
                            className="rounded-full px-2 py-0.5 font-ui text-[10px] transition-ink hover:underline hover:underline-offset-2"
                            style={{ background: 'rgba(107,142,123,0.12)', color: '#6B8E7B' }}
                          >
                            《{r.title}》
                          </Link>
                        ))}
                      </div>
                    )}
                    {m.citations && (
                      <p className="font-ui text-[10px] text-ink-soft">
                        知识库引用 {m.citations.length} 处 · {((m.latencyMs || 0) / 1000).toFixed(1)}s
                        {m.invalidCitations && m.invalidCitations.length > 0 && (
                          <span> · 通用知识补充：{m.invalidCitations.join('、')}</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ),
            )
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t border-light p-4">
          <div className="flex items-end gap-2">
            <VoiceInputButton
              onText={(t) => setInput((prev) => (prev ? `${prev}${t}` : t))}
              onError={show}
            />
            <textarea
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-xl border border-c bg-[var(--inset)] px-4 py-2.5 font-ui text-sm leading-relaxed text-ink-deep outline-none transition-ink focus:border-ink-mid"
              placeholder="有什么想问的？诗词、创作、生活…随便聊，Enter 发送…"
              rows={1}
              maxLength={2000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {busy ? (
              <button onClick={() => abortRef.current?.abort()} className="flex h-[42px] items-center gap-1.5 rounded-xl px-4 font-ui text-sm font-medium text-white transition-ink" style={{ background: '#A67C7C' }}>
                <Square className="h-3.5 w-3.5" /> 停止
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                className="flex h-[42px] items-center gap-1.5 rounded-xl px-4 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 disabled:opacity-40"
                style={{ background: 'var(--btn-grad)' }}
              >
                <Send className="h-4 w-4" /> 发送
              </button>
            )}
          </div>
          <p className="mt-2 font-ui text-[10px] text-ink-soft">AI 生成内容仅供参考，如有诗词相关提问会自动检索知识库</p>
        </div>
      </section>
      <Toast msg={msg} />
    </div>
  );
}
