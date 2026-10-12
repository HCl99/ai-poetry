'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, FlaskConical, Loader2, Play, Square, XCircle } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { sseEvents } from '@/lib/sse';

interface SampleMeta { i: number; title: string; author: string; dynasty: string }
interface SampleResult {
  i: number; title: string; latencyMs?: number; chars?: number;
  cites: number; valid: number; invalid: string[]; cumRate: number | null; error?: string;
}
interface DoneInfo {
  samples: number; totalCites: number; validCites: number; rate: number | null;
  avgLatencyMs: number; invalid: { title: string; invalid: string[] }[];
}

const SIZES = [3, 5, 8];

export function RagEvalView() {
  const [size, setSize] = useState(5);
  const [running, setRunning] = useState(false);
  const [samplesMeta, setSamplesMeta] = useState<SampleMeta[]>([]);
  const [results, setResults] = useState<SampleResult[]>([]);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const { msg, show } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    if (running) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setSamplesMeta([]); setResults([]); setDone(null);
    try {
      const r = await fetch('/api/rag-eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleSize: size }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || '评测启动失败');
      }
      for await (const { event, data } of sseEvents(r)) {
        if (event === 'meta') setSamplesMeta(data.samples);
        else if (event === 'sample') setResults((rs) => [...rs.filter((x) => x.i !== data.i), data].sort((x, y) => x.i - y.i));
        else if (event === 'done') { setDone(data); show('评测完成'); }
        else if (event === 'error') throw new Error(data.error || '评测失败');
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') show('已停止评测');
      else show(e?.message || '网络异常，请重试');
    } finally {
      setRunning(false);
    }
  }

  // 累计归因率曲线数据
  const curve = results.filter((r) => r.cumRate != null).map((r) => ({ x: r.i, y: r.cumRate as number }));
  const W = 560, H = 190, PAD = 30;
  const px = (i: number) => PAD + (samplesMeta.length > 1 ? (i / (samplesMeta.length - 1)) * (W - PAD * 2) : (W - PAD * 2) / 2);
  const py = (rate: number) => H - PAD - (rate / 100) * (H - PAD * 2);

  const finishedCount = results.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">RAG 评测面板</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          随机抽样真实跑「检索 → 生成 → 引用校验」闭环，把「引用硬约束防幻觉」从做过变成可复现
        </p>
      </div>

      {/* 闭环实验基线 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: '幻觉率（无硬约束基线）', value: '12.5%', note: '离线 A/B 实验 rag_ab_test.py', c: '#A67C7C' },
          { label: '幻觉率（引用硬约束）', value: '0%', note: '16 条样本越界引用清零', c: '#6B8E7B' },
          { label: '引用归因率', value: '93.8%', note: '引用可追溯到检索列表', c: '#7B8EA1' },
        ].map((s) => (
          <div key={s.label} className="paper-card p-5 text-center">
            <div className="font-brush text-3xl" style={{ color: s.c }}>{s.value}</div>
            <div className="mt-1 font-ui text-xs text-ink-deep">{s.label}</div>
            <div className="mt-0.5 font-ui text-[10px] text-ink-soft">{s.note}</div>
          </div>
        ))}
      </div>

      {/* 评测控制 */}
      <div className="paper-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-ui text-sm text-ink-deep">抽样数量</span>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              disabled={running}
              className="rounded-full border-[1.5px] px-4 py-1.5 font-ui text-sm transition-ink disabled:opacity-50"
              style={size === s
                ? { background: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' }
                : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
            >
              {s} 首
            </button>
          ))}
          {running ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5"
              style={{ background: '#A67C7C' }}
            >
              <Square className="h-4 w-4" /> 停止
            </button>
          ) : (
            <button
              onClick={run}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5"
              style={{ background: 'var(--btn-grad)' }}
            >
              <Play className="h-4 w-4" /> 开始评测
            </button>
          )}
        </div>
        {(running || finishedCount > 0) && (
          <div className="mt-4">
            <div className="flex items-center justify-between font-ui text-xs text-ink-soft">
              <span>评测进度 {finishedCount}/{samplesMeta.length || size}</span>
              {running && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> 每首约 8-15 秒</span>}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--inset)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(finishedCount / Math.max(samplesMeta.length || size, 1)) * 100}%`, background: '#7B8EA1' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 样本明细 */}
      {results.length > 0 && (
        <div className="paper-card p-6">
          <h2 className="mb-4 font-ui text-[15px] font-medium text-ink-deep">样本明细</h2>
          <div className="space-y-2">
            {samplesMeta.map((m) => {
              const r = results.find((x) => x.i === m.i);
              return (
                <div key={m.i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-2.5" style={{ background: 'var(--inset)' }}>
                  <span className="w-5 shrink-0 font-ui text-xs text-ink-soft">{m.i + 1}</span>
                  <span className="font-serif text-sm text-ink-deep">《{m.title}》</span>
                  <span className="font-ui text-xs text-ink-soft">〔{m.dynasty}〕{m.author}</span>
                  <span className="ml-auto flex items-center gap-2 font-ui text-xs">
                    {!r ? (
                      <span className="inline-flex items-center gap-1 text-ink-soft"><Loader2 className="h-3 w-3 animate-spin" /> 排队中</span>
                    ) : r.error ? (
                      <span style={{ color: '#A67C7C' }}>{r.error}</span>
                    ) : (
                      <>
                        {r.invalid.length === 0 ? (
                          <span className="inline-flex items-center gap-1" style={{ color: '#6B8E7B' }}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> 引用合规 {r.valid}/{r.cites}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1" style={{ color: '#A67C7C' }}>
                            <XCircle className="h-3.5 w-3.5" /> 越界 {[...new Set(r.invalid)].map((t) => `《${t}》`).join('、')}
                          </span>
                        )}
                        <span className="text-ink-soft">{(r.latencyMs! / 1000).toFixed(1)}s</span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 归因率曲线 */}
      {curve.length > 0 && (
        <div className="paper-card p-6">
          <h2 className="mb-1 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <Activity className="h-4 w-4 text-muted-blue" /> 累计归因率曲线
          </h2>
          <p className="mb-4 font-ui text-xs text-ink-soft">每完成一个样本后的累计引用合规率（合规引用 ÷ 总引用）</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {[0, 50, 100].map((v) => (
              <g key={v}>
                <line x1={PAD} x2={W - PAD} y1={py(v)} y2={py(v)} stroke="#E5DFD4" strokeDasharray="4 4" />
                <text x={PAD - 6} y={py(v) + 4} textAnchor="end" fontSize="10" fill="#8B857E">{v}%</text>
              </g>
            ))}
            {curve.length > 1 && (
              <polyline
                points={curve.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
                fill="none" stroke="#7B8EA1" strokeWidth="2" strokeLinejoin="round"
              />
            )}
            {curve.map((p) => (
              <g key={p.x}>
                <circle cx={px(p.x)} cy={py(p.y)} r="4" fill="#7B8EA1" />
                <text x={px(p.x)} y={py(p.y) - 9} textAnchor="middle" fontSize="10" fill="#5D5853">{p.y}%</text>
                <text x={px(p.x)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8B857E">#{p.x + 1}</text>
              </g>
            ))}
          </svg>
        </div>
      )}

      {/* 汇总 */}
      {done && (
        <div className="paper-card p-6 anim-fade-up">
          <h2 className="mb-4 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <FlaskConical className="h-4 w-4 text-sepia" /> 本轮评测结论
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: '评测样本', value: `${done.samples} 首` },
              { label: '引用总数', value: `${done.totalCites} 处` },
              { label: '归因率', value: done.rate == null ? '无引用' : `${done.rate}%`, c: done.rate === 100 ? '#6B8E7B' : done.rate != null && done.rate >= 90 ? '#7B8EA1' : '#A67C7C' },
              { label: '平均延迟', value: `${(done.avgLatencyMs / 1000).toFixed(1)}s` },
            ].map((s) => (
              <div key={s.label} className="rounded-lg p-4 text-center" style={{ background: 'var(--inset)' }}>
                <div className="font-brush text-2xl" style={{ color: s.c || 'var(--ink-deep)' }}>{s.value}</div>
                <div className="mt-1 font-ui text-xs text-ink-soft">{s.label}</div>
              </div>
            ))}
          </div>
          {done.invalid.length > 0 ? (
            <p className="mt-3 font-ui text-xs" style={{ color: '#A67C7C' }}>
              越界引用：{done.invalid.map((x) => `《${x.title}》→ ${x.invalid.map((t) => `《${t}》`).join('、')}`).join('；')}
            </p>
          ) : (
            <p className="mt-3 font-ui text-xs" style={{ color: '#6B8E7B' }}>
              本轮全部引用均可溯源到检索列表 · 评测日志以 eval: 前缀写入 annotation_logs，随时可复跑复现
            </p>
          )}
        </div>
      )}
      <Toast msg={msg} />
    </div>
  );
}
