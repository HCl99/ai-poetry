'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, Download, FlaskConical, Loader2, Play, Square, XCircle } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { sseEvents } from '@/lib/sse';

interface SampleMeta { i: number; title: string; author: string; dynasty: string }
interface SampleResult {
  i: number; title: string; latencyMs?: number; chars?: number;
  cites: number; valid: number; invalid: string[]; cumRate: number | null; error?: string;
}
interface DoneInfo {
  samples: number; okSamples: number; failed: number; totalCites: number; validCites: number; rate: number | null;
  avgLatencyMs: number; invalid: { title: string; invalid: string[] }[];
}

const SIZES = [3, 5, 8];

/** CSV 单元转义：含逗号、引号、换行的字段加引号 */
function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function RagEvalView() {
  const [size, setSize] = useState(5);
  const [running, setRunning] = useState(false);
  const [samplesMeta, setSamplesMeta] = useState<SampleMeta[]>([]);
  const [poolSize, setPoolSize] = useState<number | null>(null);
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
    setSamplesMeta([]); setResults([]); setDone(null); setPoolSize(null);
    const acc: SampleResult[] = [];
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
        if (event === 'meta') { setSamplesMeta(data.samples); setPoolSize(data.poolSize ?? null); }
        else if (event === 'sample') {
          acc.push(data);
          setResults((rs) => [...rs.filter((x) => x.i !== data.i), data].sort((x, y) => x.i - y.i));
        }
        else if (event === 'done') { setDone(data); show('评测完成'); }
        else if (event === 'error') throw new Error(data.error || '评测失败');
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // 停止后给出已完成样本的汇总，而不是让结论凭空消失
        const ok = acc.filter((x) => !x.error);
        if (ok.length) {
          const total = ok.reduce((s, x) => s + x.cites, 0);
          const valid = ok.reduce((s, x) => s + x.valid, 0);
          setDone({
            samples: acc.length,
            okSamples: ok.length,
            failed: acc.length - ok.length,
            totalCites: total,
            validCites: valid,
            rate: total ? +((valid / total) * 100).toFixed(1) : null,
            avgLatencyMs: Math.round(ok.reduce((s, x) => s + (x.latencyMs || 0), 0) / ok.length),
            invalid: ok.filter((x) => x.invalid.length).map((x) => ({ title: x.title, invalid: x.invalid })),
          });
        }
        show(ok.length ? '已停止评测，结论按已完成样本统计' : '已停止评测');
      } else {
        show(e?.message || '网络异常，请重试');
      }
    } finally {
      setRunning(false);
    }
  }

  // 累计归因率曲线数据
  const curve = results.filter((r) => r.cumRate != null).map((r) => ({ x: r.i, y: r.cumRate as number }));
  const W = 560, H = 190, PAD = 30;
  const px = (i: number) => PAD + (samplesMeta.length > 1 ? (i / (samplesMeta.length - 1)) * (W - PAD * 2) : (W - PAD * 2) / 2);
  const py = (rate: number) => H - PAD - (rate / 100) * (H - PAD * 2);

  function exportCsv() {
    if (!results.length) return;
    const ok = results.filter((r) => !r.error);
    const total = ok.reduce((s, r) => s + r.cites, 0);
    const valid = ok.reduce((s, r) => s + r.valid, 0);
    const rate = total ? `${((valid / total) * 100).toFixed(1)}%` : '—';
    const avg = ok.length ? Math.round(ok.reduce((s, r) => s + (r.latencyMs || 0), 0) / ok.length) : 0;
    const lines = [
      `评测时间,${new Date().toLocaleString('zh-CN')}`,
      `抽样池(有标签诗篇),${poolSize ?? '—'}`,
      `样本数,${results.length}`,
      `成功/失败,${ok.length}/${results.length - ok.length}`,
      `总引用/合规引用,${total}/${valid}`,
      `引用归因率(可追溯率),${rate}`,
      `平均延迟ms(仅成功样本),${avg}`,
      '',
      '序号,诗题,作者,朝代,总引用,合规引用,归因率,延迟ms,越界引用,错误',
      ...results.map((r) => {
        const meta = samplesMeta.find((m) => m.i === r.i);
        return [
          r.i + 1,
          csvCell(r.title),
          csvCell(meta?.author ?? ''),
          csvCell(meta?.dynasty ?? ''),
          r.cites ?? 0,
          r.valid ?? 0,
          r.cites ? `${((r.valid / r.cites) * 100).toFixed(1)}%` : '—',
          r.latencyMs ?? 0,
          csvCell(r.invalid.join(' / ')),
          csvCell(r.error || ''),
        ].join(',');
      }),
    ];
    const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rag-eval-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    show('评测结果已导出 CSV');
  }

  const finishedCount = results.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">RAG 评测面板</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          随机抽样真实跑「检索 → 生成 → 引用校验」闭环，把「引用硬约束 + 越界可查」从做过变成可复现
        </p>
      </div>

      {/* 技术自证：长尾分段评测（客观指标，对照全库核验） */}
      <div className="paper-card p-6">
        <h2 className="mb-1 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
          <FlaskConical className="h-4 w-4 text-sepia" /> 长尾知识问答：有检索 vs 无检索
        </h2>
        <p className="mb-4 font-ui text-xs text-ink-soft">
          20 位冷门诗人（小传不足 100 字、库内仅存 4~300 首）× 2 组回答。篇名归属与诗句均对照全库核验，是客观指标而非盲评。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="font-ui text-xs text-ink-soft">
                <th className="py-2 pr-3 font-normal">指标</th>
                <th className="py-2 pr-3 font-normal">无检索基线</th>
                <th className="py-2 font-normal">本系统（RAG）</th>
              </tr>
            </thead>
            <tbody className="font-ui text-sm">
              {[
                { k: '篇名正确归属', base: '0 / 60（0.0%）', rag: '54 / 61（88.5%）' },
                { k: '杜撰篇名率', base: '31.7%', rag: '8.2%' },
                { k: '诗句可验证率', base: '0.0%（0/404）', rag: '42.8%（155/362）' },
                { k: '盲评整体质量', base: '6.35', rag: '6.6（胜 11 / 平 1 / 负 8）' },
              ].map((r) => (
                <tr key={r.k} className="border-t" style={{ borderColor: 'var(--border-c)' }}>
                  <td className="py-2.5 pr-3 text-ink-deep">{r.k}</td>
                  <td className="py-2.5 pr-3" style={{ color: '#A67C7C' }}>{r.base}</td>
                  <td className="py-2.5" style={{ color: '#6B8E7B' }}>{r.rag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-ui text-[11px] text-ink-soft">
          数据来源：scripts/rag_longtail_test.py（种子 7，可复跑）· 报告 docs/rag_longtail_report.md · 下方面板可现场复跑另一套「引用硬约束」闭环
        </p>
      </div>

      {/* 闭环实验基线 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: '越界引用（无硬约束基线）', value: '2 / 16', note: '离线 A/B：16 条引用中 2 条为杜撰诗题', c: '#A67C7C' },
          { label: '越界引用（引用硬约束）', value: '0 / 16', note: '同一批 16 条样本，越界引用清零', c: '#6B8E7B' },
          { label: '引用归因率', value: '93.8%', note: '口径：引用能在检索列表中追溯到（非内容正确）', c: '#7B8EA1' },
        ].map((s) => (
          <div key={s.label} className="paper-card p-5 text-center">
            <div className="font-brush text-3xl" style={{ color: s.c }}>{s.value}</div>
            <div className="mt-1 font-ui text-xs text-ink-deep">{s.label}</div>
            <div className="mt-0.5 font-ui text-[10px] text-ink-soft">{s.note}</div>
          </div>
        ))}
      </div>
      <p className="-mt-3 font-ui text-[11px] text-ink-soft">
        以上三张卡来自离线脚本 rag_ab_test.py（种子 7，16 条样本），<strong className="font-medium">仅覆盖「引用是否越界」这一个维度，样本量小，不能外推为整体准确率</strong>；下方闭环可现场复跑。
      </p>
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
          <div className="ml-auto flex items-center gap-2">
            {!running && results.length > 0 && (
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-c px-3.5 py-2 font-ui text-sm text-ink-mid transition-ink hover:text-ink-deep"
                title="导出本轮明细与汇总（CSV，可直接用 Excel 打开）"
              >
                <Download className="h-4 w-4" /> 导出 CSV
              </button>
            )}
            {running ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5"
                style={{ background: '#A67C7C' }}
              >
                <Square className="h-4 w-4" /> 停止
              </button>
            ) : (
              <button
                onClick={run}
                className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5"
                style={{ background: 'var(--btn-grad)' }}
              >
                <Play className="h-4 w-4" /> 开始评测
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 font-ui text-[11px] text-ink-soft">
          {poolSize != null
            ? `抽样池：库内有标签诗篇 ${poolSize.toLocaleString()} 首（以经典篇目为主，检索命中率天然偏高）`
            : '抽样池：库内有标签诗篇'}
          <span className="mx-1.5">·</span>
          同一账号短时间内最多 2 次，超出会提示稍后再试
        </p>
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

      {/* 未运行时的空状态说明 */}
      {!running && !done && results.length === 0 && (
        <div className="paper-card p-6">
          <h2 className="mb-3 font-ui text-[15px] font-medium text-ink-deep">这个面板测什么</h2>
          <ul className="space-y-1.5 font-ui text-xs leading-6 text-ink-soft">
            <li>· 每首样本都真实走一遍「混合检索 → CrossEncoder 精排 → 注解生成 → 引用校验」，不是回放历史数据。</li>
            <li>· 归因率 = 回答里引用的诗题能在本次检索列表中追溯到的比例；它衡量「引用是否有据」，<span className="text-ink-deep">不等于内容判断正确</span>。</li>
            <li>· 样本量仅 3–8 首，单条样本即可让归因率波动 ±10 个百分点，结论仅供趋势参考。</li>
            <li>· 中途点「停止」会立刻中断后续样本，并按已完成的样本给出汇总。</li>
          </ul>
        </div>
      )}

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
                  <span className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 font-ui text-xs">
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
                          <span className="inline-flex flex-wrap items-center gap-1 break-words" style={{ color: '#A67C7C' }}>
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
          <p className="mb-4 font-ui text-xs text-ink-soft">每完成一个样本后的累计引用合规率（合规引用 ÷ 总引用）。口径是「能否追溯到检索列表」，不是「内容是否正确」。</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {[0, 50, 100].map((v) => (
              <g key={v}>
                <line x1={PAD} x2={W - PAD} y1={py(v)} y2={py(v)} stroke="var(--border-c)" strokeDasharray="4 4" />
                <text x={PAD - 6} y={py(v) + 4} textAnchor="end" fontSize="10" fill="var(--ink-soft)">{v}%</text>
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
                <text x={px(p.x)} y={py(p.y) - 9} textAnchor="middle" fontSize="10" fill="var(--ink-mid)">{p.y}%</text>
                <text x={px(p.x)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-soft)">#{p.x + 1}</text>
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
              { label: '评测样本', value: `${done.samples} 首${done.failed ? `（失败 ${done.failed}）` : ''}` },
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
          <p className="mt-3 font-ui text-[11px] text-ink-soft">
            样本量 {done.samples} 首（≤8），单条样本即可让归因率波动约 ±10 个百分点，结论仅供趋势参考，不能作为整体准确率对外表述。
          </p>
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
