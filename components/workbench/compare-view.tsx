'use client';

import { useEffect, useRef, useState } from 'react';
import { FlaskConical, Loader2, Play, Scale, Search, Shuffle, Square } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { sseEvents } from '@/lib/sse';
import { ANNOTATION_SECTIONS, type SectionMap } from '@/lib/sections';

interface PoemPick { id: string; title: string; author: string; dynasty: string }
interface ModelMeta { key: 'A' | 'B'; model: string; label: string }
interface CiteStat { total: number; valid: string[]; invalid: string[] }
interface ModelResult {
  key: 'A' | 'B'; model: string; label: string; latencyMs: number; chars: number;
  sections: SectionMap | null; cite: CiteStat; error?: string;
}
interface Meta {
  title: string; author: string; dynasty: string; hasBio: boolean;
  related: { id: string; title: string; author: string; dynasty: string; score: number | null }[];
  models: ModelMeta[];
}

const COLORS: Record<'A' | 'B', string> = { A: '#6B8E7B', B: '#7B8EA1' };

export function CompareView() {
  const [q, setQ] = useState('');
  const [cands, setCands] = useState<PoemPick[]>([]);
  const [poem, setPoem] = useState<PoemPick | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [texts, setTexts] = useState<{ A: string; B: string }>({ A: '', B: '' });
  const [doneEach, setDoneEach] = useState<{ A?: number; B?: number }>({});
  const [result, setResult] = useState<{ a: ModelResult; b: ModelResult } | null>(null);
  const { msg, show } = useToast();
  const abortRef = useRef<AbortController | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** 诗题/作者检索（防抖 300ms） */
  function search(v: string) {
    setQ(v);
    if (debRef.current) clearTimeout(debRef.current);
    if (!v.trim()) { setCands([]); return; }
    debRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/poems/list?q=${encodeURIComponent(v.trim())}&limit=8`);
        const d = await r.json();
        setCands(Array.isArray(d) ? d : []);
      } catch { setCands([]); }
    }, 300);
  }

  /** 随机抽一首经典 */
  async function randomPick() {
    try {
      const r = await fetch('/api/recite/poem?source=random');
      const d = await r.json();
      if (!r.ok) throw new Error();
      setPoem({ id: d.id, title: d.title, author: d.author, dynasty: d.dynasty });
      setQ(''); setCands([]);
    } catch { show('随机取诗失败，请重试'); }
  }

  function stop() { abortRef.current?.abort(); }

  /** 双模型并行对比：同一检索上下文，流式渲染两侧 */
  async function run() {
    if (!poem || running) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setSteps([]); setMeta(null); setResult(null);
    setTexts({ A: '', B: '' }); setDoneEach({});
    try {
      const r = await fetch('/api/compare-annot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poemId: poem.id }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || '对比失败');
      }
      for await (const { event, data } of sseEvents(r)) {
        if (event === 'step') setSteps((s) => [...s, `${data.label} · ${data.detail}`]);
        else if (event === 'meta') setMeta(data);
        else if (event === 'deltaA') setTexts((t) => ({ ...t, A: t.A + (data.text || '') }));
        else if (event === 'deltaB') setTexts((t) => ({ ...t, B: t.B + (data.text || '') }));
        else if (event === 'doneA') setDoneEach((d) => ({ ...d, A: data.latencyMs }));
        else if (event === 'doneB') setDoneEach((d) => ({ ...d, B: data.latencyMs }));
        else if (event === 'done') { setResult({ a: data.a, b: data.b }); show('双模型对比完成'); }
        else if (event === 'error') throw new Error(data.error || '对比失败');
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') show('已停止对比');
      else show(e?.message || '网络异常，请重试');
    } finally {
      setRunning(false);
    }
  }

  /** 结论：速度、引用合规、四维齐备三维裁决 */
  function verdict(): string[] {
    if (!result || result.a.error || result.b.error) return [];
    const { a, b } = result;
    const out: string[] = [];
    if (a.latencyMs && b.latencyMs) {
      const fast = a.latencyMs <= b.latencyMs ? a : b;
      const slow = fast === a ? b : a;
      out.push(`速度：${fast.model} 快 ${(slow.latencyMs / Math.max(fast.latencyMs, 1)).toFixed(1)} 倍（${(fast.latencyMs / 1000).toFixed(1)}s vs ${(slow.latencyMs / 1000).toFixed(1)}s）`);
    }
    for (const m of [a, b]) {
      const rate = m.cite.total === 0 ? '无引用' : `合规率 ${((m.cite.valid.length / m.cite.total) * 100).toFixed(0)}%（${m.cite.valid.length}/${m.cite.total}）`;
      const dims = m.sections ? ANNOTATION_SECTIONS.filter((s) => (m.sections as SectionMap)[s.key]?.trim()).length : 0;
      out.push(`${m.model}：引用 ${rate} · 四维齐备 ${dims}/4 · 正文 ${m.chars} 字`);
    }
    return out;
  }

  const renderColumn = (key: 'A' | 'B') => {
    const mm = meta?.models.find((m) => m.key === key);
    const res = key === 'A' ? result?.a : result?.b;
    const color = COLORS[key];
    const latency = doneEach[key];
    const finished = !!res;
    return (
      <div className="paper-card flex min-h-[380px] flex-col p-5" style={{ borderTop: `3px solid ${color}` }}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="rounded-full px-3 py-1 font-ui text-xs font-medium" style={{ background: `${color}1f`, color }}>
            {mm?.label || (key === 'A' ? 'GLM-4-Flash · 快速对话' : 'GLM-Z1-Flash · 深度推理')}
          </span>
          <span className="font-ui text-xs text-ink-soft">
            {res?.error ? '生成失败' : finished ? `完成 · ${(res.latencyMs / 1000).toFixed(1)}s` : latency ? `完成 · ${(latency / 1000).toFixed(1)}s` : running ? '生成中…' : '待命'}
          </span>
        </div>

        {/* 流式原文 / 完成后四维分节 */}
        {res?.sections ? (
          <div className="space-y-2.5">
            {ANNOTATION_SECTIONS.map((s) => (
              <div key={s.key} className="rounded-lg p-3" style={{ background: 'var(--inset)' }}>
                <div className="mb-1 font-ui text-xs font-medium" style={{ color }}>{s.tag}</div>
                <p className="font-ui text-[13px] leading-relaxed text-ink-mid">{(res.sections as SectionMap)[s.key] || '（模型未输出该节）'}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="whitespace-pre-wrap font-ui text-[13px] leading-relaxed text-ink-mid">
            {texts[key]}
            {running && !latency && <span className="ml-0.5 inline-block animate-pulse text-sepia">▍</span>}
            {!running && !texts[key] && <span className="text-ink-soft/60">等待开始对比…</span>}
          </p>
        )}

        {/* 单模型指标 */}
        {res && !res.error && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-light pt-3 font-ui text-xs text-ink-soft">
            <span>延迟 {(res.latencyMs / 1000).toFixed(1)}s</span>
            <span>·</span>
            <span>{res.chars} 字</span>
            <span>·</span>
            <span style={{ color: res.cite.invalid.length ? '#A67C7C' : '#6B8E7B' }}>
              引用合规 {res.cite.valid.length}/{res.cite.total}
            </span>
            {res.cite.invalid.length > 0 && (
              <span className="w-full" style={{ color: '#A67C7C' }}>
                越界引用：{[...new Set(res.cite.invalid)].map((t) => `《${t}》`).join('、')}
              </span>
            )}
          </div>
        )}
        {res?.error && <p className="mt-2 font-ui text-xs" style={{ color: '#A67C7C' }}>{res.error}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">多模型对比</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          同一首诗、同一次 RAG 检索，GLM-4-Flash 与 GLM-Z1-Flash 并行生成四维度注解，实测流式延迟与引用合规差异
        </p>
      </div>

      {/* 选诗区 */}
      <div className="paper-card p-6">
        <h2 className="mb-4 font-ui text-[15px] font-medium text-ink-deep">选择对比诗篇</h2>
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"><Search className="h-4 w-4" /></span>
            <input
              value={q}
              onChange={(e) => search(e.target.value)}
              placeholder="搜索诗题或作者，如「静夜思」「李白」…"
              className="h-10 w-full rounded-lg border-[1.5px] border-c bg-white/70 pl-10 pr-4 font-ui text-sm outline-none transition-ink focus:border-ink-mid"
            />
            {cands.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-c bg-white shadow-ink-hover">
                {cands.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setPoem(c); setQ(''); setCands([]); }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left font-ui text-sm transition-ink hover:bg-paper-dark"
                  >
                    <span className="font-serif text-ink-deep">《{c.title}》</span>
                    <span className="text-xs text-ink-soft">〔{c.dynasty}〕{c.author}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={randomPick}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-c px-4 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark"
          >
            <Shuffle className="h-4 w-4" /> 随机一首
          </button>
          {running ? (
            <button
              onClick={stop}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-5 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5"
              style={{ background: '#A67C7C' }}
            >
              <Square className="h-4 w-4" /> 停止
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!poem}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-5 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 disabled:opacity-50"
              style={{ background: 'var(--btn-grad)' }}
            >
              <Play className="h-4 w-4" /> 开始对比
            </button>
          )}
        </div>
        {poem && (
          <p className="mt-3 font-ui text-sm text-ink-mid">
            当前诗篇：<span className="font-serif text-ink-deep">《{poem.title}》</span>
            <span className="ml-1 text-xs text-ink-soft">〔{poem.dynasty}〕{poem.author}</span>
          </p>
        )}
        {steps.length > 0 && !result && (
          <div className="mt-3 space-y-1">
            {steps.map((s, i) => (
              <p key={i} className="flex items-center gap-1.5 font-ui text-xs text-ink-soft">
                <FlaskConical className="h-3 w-3 text-sepia" /> {s}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* 双栏对比 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {renderColumn('A')}
        {renderColumn('B')}
      </div>

      {/* 裁决区 */}
      {result && (
        <div className="paper-card p-6 anim-fade-up">
          <h2 className="mb-3 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <Scale className="h-4 w-4 text-sepia" /> 对比裁决
          </h2>
          {verdict().length ? (
            <ul className="space-y-1.5">
              {verdict().map((v, i) => (
                <li key={i} className="font-ui text-sm leading-relaxed text-ink-mid">· {v}</li>
              ))}
            </ul>
          ) : (
            <p className="font-ui text-sm text-ink-soft">一侧模型生成失败，无法裁决，可重试</p>
          )}
          {meta && meta.related.length > 0 && (
            <p className="mt-3 border-t border-light pt-3 font-ui text-xs text-ink-soft">
              共享检索上下文：{meta.related.map((r) => `《${r.title}》`).join('、')} · 引用硬约束对两模型同时生效
            </p>
          )}
        </div>
      )}

      {running && !result && (
        <p className="flex items-center justify-center gap-2 font-ui text-xs text-ink-soft">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 双模型并行生成中，思维链模型通常更慢但推理更深…
        </p>
      )}
      <Toast msg={msg} />
    </div>
  );
}
