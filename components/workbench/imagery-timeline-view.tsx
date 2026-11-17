'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, TrendingUp, Quote, Info } from 'lucide-react';

export interface TimelineData {
  dynasties: { name: string; poems: number }[];
  chars: string[];
  matrix: Record<string, Record<string, number>>;
  examples: Record<string, Record<string, { line: string; title: string; author: string }[]>>;
  generatedAt: string;
}

const PRESET_CHARS = ['月', '风', '花', '梅', '柳', '雁', '雪', '江'];
const CHART_TABS = [
  { key: 'line', label: '折线' },
  { key: 'bar', label: '柱状' },
  { key: 'radar', label: '雷达' },
  { key: 'tree', label: '树状' },
] as const;
const BAR_COLORS = ['#7B8EA1', '#6B8E7B', '#8B7355', '#A67C7C', '#C4A965', '#9C9487'];
const COMPARE_COLOR = '#6B8E7B';

// 小传样本低于此值的朝代，每万首热度只作参考，不参与峰值与涨跌结论
const MIN_SAMPLE = 1000;

// 朝代起止年（史实常量）：本页 x 轴按朝代顺序等距排列，年份用于标注，避免误读为严格时间轴
const DYNASTY_SPAN: Record<string, string> = {
  先秦: '前11世纪—前221',
  汉魏: '前202—265',
  唐: '618—907',
  五代: '907—960',
  宋: '960—1279',
  元: '1271—1368',
  清: '1644—1912',
};

/** 每万首诗中含该意象的诗数（跨朝代可比的热度口径） */
function heat(count: number, poems: number) {
  return poems > 0 ? Math.round((count / poems) * 10000) : 0;
}

const W = 560;
const H = 190;
const PAD = { l: 46, r: 16, t: 18, b: 30 };
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;

export function ImageryTimelineView({ data, initialDynasty, initialChar }: {
  data: TimelineData;
  initialDynasty?: string;
  initialChar?: string;
}) {
  const router = useRouter();
  const [di, setDi] = useState(() => {
    const idx = data.dynasties.findIndex((d) => d.name === initialDynasty);
    return idx >= 0 ? idx : Math.max(0, data.dynasties.findIndex((d) => d.name === '唐'));
  });
  const [focus, setFocus] = useState(
    initialChar && data.chars.includes(initialChar) ? initialChar : '月',
  );
  const [compare, setCompare] = useState<string | null>(null);
  // 图表形态：同一份数据换四种看法，避免只有一条折线
  const [chart, setChart] = useState<'line' | 'bar' | 'radar' | 'tree'>('line');

  const dyn = data.dynasties[di];

  /** 切朝代/意象时同步 URL，支持从数据大屏下钻与分享 */
  function syncUrl(nextDi: number, nextChar: string) {
    const name = data.dynasties[nextDi]?.name ?? '';
    router.replace(
      `/workbench/imagery-timeline?dynasty=${encodeURIComponent(name)}&char=${encodeURIComponent(nextChar)}`,
      { scroll: false },
    );
  }
  function pickDynasty(i: number) {
    setDi(i);
    syncUrl(i, focus);
  }
  function pickChar(c: string) {
    setFocus(c);
    if (compare === c) setCompare(null);
    syncUrl(di, c);
  }

  // 当前朝代 Top12 意象（按每万首热度排序，跨朝代可比）
  const top = useMemo(() => {
    return data.chars
      .map((c) => {
        const count = data.matrix[c]?.[dyn.name] ?? 0;
        return { char: c, count, heat: heat(count, dyn.poems) };
      })
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 12);
  }, [data, dyn.name, dyn.poems]);
  const topHeatMax = top[0]?.heat || 1;

  /** 某意象的跨朝代序列 */
  const curveOf = (char: string) =>
    data.dynasties.map((d) => {
      const count = data.matrix[char]?.[d.name] ?? 0;
      return {
        name: d.name,
        poems: d.poems,
        count,
        heat: heat(count, d.poems),
        reliable: d.poems >= MIN_SAMPLE,
      };
    });

  const curve = useMemo(() => curveOf(focus), [data, focus]);
  const compareCurve = useMemo(() => (compare ? curveOf(compare) : []), [data, compare]);

  // 只按样本足够（≥1000 首）的朝代定标尺，避免汉魏 26 首的噪声尖峰把唐/宋压成一条直线
  const reliable = curve.filter((p) => p.reliable);
  const scaleMax = Math.max(
    ...reliable.map((p) => p.heat),
    ...compareCurve.filter((p) => p.reliable).map((p) => p.heat),
    1,
  );
  const peak = reliable.reduce((a, b) => (b.heat > a.heat ? b : a), reliable[0]);

  const tang = curve.find((p) => p.name === '唐');
  const song = curve.find((p) => p.name === '宋');
  const tsDelta = tang && song && tang.heat > 0
    ? Math.round(((song.heat - tang.heat) / tang.heat) * 100)
    : null;
  const cmpTang = compareCurve.find((p) => p.name === '唐');
  const cmpSong = compareCurve.find((p) => p.name === '宋');
  const cmpDelta = cmpTang && cmpSong && cmpTang.heat > 0
    ? Math.round(((cmpSong.heat - cmpTang.heat) / cmpTang.heat) * 100)
    : null;

  const examples = data.examples[focus]?.[dyn.name] ?? [];
  const uninhabited = curve.filter((p) => !p.reliable);

  // 等距排列（朝代序列），y 按可靠朝代的最值定标，越界点贴顶显示并标注「样本不足」
  const ptsOf = (arr: typeof curve) =>
    arr.map((p, i) => ({
      ...p,
      x: +(PAD.l + (IW * i) / Math.max(arr.length - 1, 1)).toFixed(2),
      y: +(PAD.t + IH - (IH * Math.min(p.heat, scaleMax)) / scaleMax).toFixed(2),
      clipped: p.heat > scaleMax,
    }));
  const pts = ptsOf(curve);
  const cmpPts = ptsOf(compareCurve);
  const line = (arr: typeof pts) =>
    arr.filter((p) => p.reliable).map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">意象时空地图</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          全库 {data.dynasties.reduce((s, d) => s + d.poems, 0).toLocaleString()} 首诗 · {data.chars.length} 个核心意象 · 拖动朝代滑块，看同一意象在各朝代的相对热度
        </p>
      </div>

      {/* 朝代滑块 */}
      <div className="paper-card p-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <div className="font-brush text-4xl text-ink-deep">{dyn.name}</div>
              <span className="font-ui text-xs text-ink-soft">{DYNASTY_SPAN[dyn.name] || ''}</span>
            </div>
            <div className="mt-1 font-ui text-xs text-ink-soft">
              本朝诗库 {dyn.poems.toLocaleString()} 首
              {!curve[di]?.reliable && <span className="ml-2 text-[#A67C7C]">样本不足 {MIN_SAMPLE} 首，热度仅作参考</span>}
            </div>
          </div>
          <div className="font-ui text-xs text-ink-soft">
            {di + 1} / {data.dynasties.length}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={data.dynasties.length - 1}
          step={1}
          value={di}
          onChange={(e) => pickDynasty(+e.target.value)}
          className="w-full"
          style={{ accentColor: 'var(--ink-mid)' }}
          aria-label="朝代滑块"
        />
        <div className="mt-1 flex justify-between gap-1 overflow-x-auto">
          {data.dynasties.map((d, i) => (
            <button
              key={d.name}
              onClick={() => pickDynasty(i)}
              className={`shrink-0 font-ui text-xs transition-ink ${i === di ? 'font-medium text-ink-deep' : 'text-ink-soft hover:text-ink-deep'}`}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 当前朝代 Top 意象 */}
        <div className="paper-card p-6">
          <h2 className="mb-1 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <MapPin className="h-4 w-4 text-muted-blue" /> {dyn.name}代热门意象 Top{top.length}
          </h2>
          <p className="mb-4 font-ui text-[11px] text-ink-soft">按每万首诗中出现的次数排序，跨朝代可直接比较</p>
          <div className="space-y-2.5">
            {top.map((t, i) => (
              <button
                key={t.char}
                onClick={() => pickChar(t.char)}
                className="group flex w-full items-center gap-3 text-left"
                title={`查看「${t.char}」的朝代演变`}
              >
                <span className={`w-6 shrink-0 text-center font-brush text-lg ${t.char === focus ? 'text-ink-deep' : 'text-ink-mid'}`}>
                  {t.char}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-paper-dark">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(3, Math.round((t.heat / topHeatMax) * 100))}%`,
                      background: t.char === focus ? 'var(--ink-deep)' : BAR_COLORS[i % BAR_COLORS.length],
                      opacity: t.char === focus ? 1 : 0.7,
                    }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right font-ui text-[11px] text-ink-soft">
                  <span className="tabular-nums text-ink-deep">{t.heat.toLocaleString()}</span> /万首
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 font-ui text-xs text-ink-soft">点击任意意象，下方查看它的朝代演变</p>
        </div>

        {/* 例句 */}
        <div className="paper-card p-6">
          <h2 className="mb-4 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <Quote className="h-4 w-4 text-muted-blue" /> 「{focus}」在{dyn.name}代的诗句
          </h2>
          {examples.length ? (
            <div className="space-y-4">
              {examples.map((ex, i) => (
                <div key={`${ex.title}-${i}`} className="border-l-2 pl-4" style={{ borderColor: BAR_COLORS[i % BAR_COLORS.length] }}>
                  <div className="font-brush text-lg leading-relaxed text-ink-deep">{ex.line}</div>
                  <div className="mt-1 font-ui text-xs text-ink-soft">
                    《{ex.title}》 {ex.author}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center font-ui text-sm text-ink-soft">{dyn.name}代暂无「{focus}」的例句</div>
          )}
          <div className="mt-5 flex items-center justify-between gap-3">
            <Link
              href={`/workbench/explore?q=${encodeURIComponent(focus)}`}
              className="font-ui text-xs text-ink-mid underline underline-offset-4 transition-ink hover:text-ink-deep"
            >
              在诗库中查看更多含「{focus}」的诗 →
            </Link>
          </div>
          {/* 快捷意象 */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-c pt-4">
            {PRESET_CHARS.map((c) => (
              <button
                key={c}
                onClick={() => pickChar(c)}
                className={`rounded-full px-3 py-1 font-brush text-sm transition-ink ${
                  c === focus
                    ? 'text-[var(--btn-text)]'
                    : 'bg-paper-dark text-ink-deep hover:opacity-80'
                }`}
                style={c === focus ? { background: 'var(--btn-bg)' } : undefined}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 演变曲线 */}
      <div className="paper-card p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <TrendingUp className="h-4 w-4 text-muted-blue" /> 「{focus}」的朝代演变 · 每万首热度
          </h2>
          <div className="font-ui text-xs text-ink-soft">
            {peak && peak.heat > 0 ? (
              <>峰值：<span className="font-medium text-ink-deep">{peak.name}代 {peak.heat.toLocaleString()}/万首</span></>
            ) : null}
            {tsDelta !== null && (
              <span className="ml-3">
                唐→宋 <span style={{ color: tsDelta >= 0 ? '#6B8E7B' : '#A67C7C' }}>{tsDelta >= 0 ? '+' : ''}{tsDelta}%</span>
              </span>
            )}
          </div>
        </div>

        {/* 对比意象 */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-ui text-[11px] text-ink-soft">叠加对比：</span>
          {PRESET_CHARS.filter((c) => c !== focus).map((c) => (
            <button
              key={c}
              onClick={() => setCompare(compare === c ? null : c)}
              className="rounded-full border border-c px-2.5 py-0.5 font-brush text-xs transition-ink hover:bg-paper-dark"
              style={compare === c ? { borderColor: COMPARE_COLOR, color: COMPARE_COLOR } : undefined}
            >
              {c}
            </button>
          ))}
          {compare && (
            <span className="font-ui text-[11px]" style={{ color: COMPARE_COLOR }}>
              {compare} 唐→宋 {cmpDelta === null ? '—' : `${cmpDelta >= 0 ? '+' : ''}${cmpDelta}%`}
            </span>
          )}
        </div>

        {/* 图表形态：折线看趋势、柱状看落差、雷达看多维轮廓、树状看构成 */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="font-ui text-[11px] text-ink-soft">图表：</span>
          {CHART_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setChart(t.key)}
              className="rounded-full border px-3 py-0.5 font-ui text-xs transition-ink"
              style={chart === t.key
                ? { borderColor: 'var(--ink-deep)', background: 'var(--ink-deep)', color: 'var(--paper)' }
                : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {chart === 'line' && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {/* 网格 */}
          {[0, 0.5, 1].map((r) => {
            const y = +(PAD.t + IH - IH * r).toFixed(2);
            return (
              <g key={r}>
                <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--border-c)" strokeWidth={1} />
                <text x={PAD.l - 6} y={y + 3.5} textAnchor="end" fontSize={9} fill="var(--ink-soft)">
                  {Math.round(scaleMax * r).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* 焦点曲线：面积 + 实线（仅连接样本足够的朝代） */}
          {(() => {
            const rel = pts.filter((p) => p.reliable);
            if (rel.length < 2) return null;
            const body = rel.map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <>
                <polygon
                  points={`${rel[0].x},${PAD.t + IH} ${body} ${rel[rel.length - 1].x},${PAD.t + IH}`}
                  fill="var(--ink-deep)"
                  opacity={0.06}
                />
                <polyline points={body} fill="none" stroke="var(--ink-deep)" strokeWidth={2} strokeLinejoin="round" />
              </>
            );
          })()}

          {/* 对比曲线 */}
          {compare && (
            <polyline points={line(cmpPts)} fill="none" stroke={COMPARE_COLOR} strokeWidth={1.6} strokeDasharray="5 3" opacity={0.9} />
          )}

          {/* 焦点数据点 */}
          {pts.map((p, i) => (
            <g key={p.name} className="cursor-pointer" onClick={() => pickDynasty(i)}>
              {/* 透明大热区，保证移动端可点（可见圆点仅 3.5–5px） */}
              <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
              {p.reliable ? (
                <>
                  <circle
                    cx={p.x} cy={p.y} r={i === di ? 5 : 3.5}
                    fill={i === di ? 'var(--ink-deep)' : 'var(--paper)'}
                    stroke="var(--ink-deep)" strokeWidth={1.5}
                  />
                  <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill="var(--ink-mid)">
                    {p.heat.toLocaleString()}
                  </text>
                </>
              ) : (
                <>
                  {/* 样本不足：不参与曲线，只在基线上打一个虚线圈，避免「飘在半空的点和 n= 标签」 */}
                  <circle
                    cx={p.x} cy={PAD.t + IH} r={3.5}
                    fill="var(--paper)" stroke="var(--ink-soft)" strokeWidth={1.2} strokeDasharray="2 2"
                  >
                    <title>{`样本不足：本朝仅 ${p.poems} 首，热度不参与曲线`}</title>
                  </circle>
                </>
              )}
              <text
                x={p.x} y={H - 10} textAnchor="middle" fontSize={10}
                fill={i === di ? 'var(--ink-deep)' : 'var(--ink-soft)'}
                fontWeight={i === di ? 600 : 400}
              >
                {p.name}
              </text>
            </g>
          ))}
        </svg>
        )}

        {/* 柱状：同一口径下两首意象逐朝代对比，落差一眼可见 */}
        {chart === 'bar' && (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="各朝代热度柱状对比">
            {[0, 0.5, 1].map((r) => {
              const y = +(PAD.t + IH - IH * r).toFixed(2);
              return (
                <g key={r}>
                  <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--border-c)" strokeWidth={1} />
                  <text x={PAD.l - 6} y={y + 3.5} textAnchor="end" fontSize={9} fill="var(--ink-soft)">
                    {Math.round(scaleMax * r).toLocaleString()}
                  </text>
                </g>
              );
            })}
            {(() => {
              const n = curve.length;
              const groupW = IW / n;
              const barW = Math.min(compare ? 13 : 22, groupW * 0.3);
              return curve.map((p, i) => {
                const cx = PAD.l + groupW * (i + 0.5);
                const h = p.reliable ? (IH * Math.min(p.heat, scaleMax)) / scaleMax : 0;
                const cmp = compareCurve[i];
                const cmpH = cmp ? (IH * Math.min(cmp.heat, scaleMax)) / scaleMax : 0;
                const fx = compare ? cx - barW - 1 : cx - barW / 2;
                return (
                  <g key={p.name} className="cursor-pointer" onClick={() => pickDynasty(i)}>
                    <rect
                      x={fx} y={PAD.t + IH - Math.max(h, 2)} width={barW} height={Math.max(h, 2)} rx={2}
                      fill="var(--ink-deep)" opacity={p.reliable ? (i === di ? 1 : 0.55) : 0.25}
                    >
                      <title>{`${focus} · ${p.name}：${p.heat.toLocaleString()}/万首（${p.count} 首）`}</title>
                    </rect>
                    {compare && cmp && (
                      <rect x={cx + 1} y={PAD.t + IH - Math.max(cmpH, 2)} width={barW} height={Math.max(cmpH, 2)} rx={2} fill={COMPARE_COLOR} opacity={0.75}>
                        <title>{`${compare} · ${p.name}：${cmp.heat.toLocaleString()}/万首（${cmp.count} 首）`}</title>
                      </rect>
                    )}
                    <text
                      x={cx} y={H - 10} textAnchor="middle" fontSize={10}
                      fill={i === di ? 'var(--ink-deep)' : 'var(--ink-soft)'}
                      fontWeight={i === di ? 600 : 400}
                    >
                      {p.name}
                    </text>
                  </g>
                );
              });
            })()}
          </svg>
        )}

        {/* 雷达：把七朝热度摊成七个维度，看两个意象的「形状」差异 */}
        {chart === 'radar' && (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="多维热度雷达图">
            {(() => {
              const cx = W / 2;
              const cy = H / 2 + 6;
              const R = Math.min(IW, IH) / 2 - 14;
              const n = curve.length;
              const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
              const pt = (i: number, ratio: number) => [
                +(cx + Math.cos(ang(i)) * R * ratio).toFixed(1),
                +(cy + Math.sin(ang(i)) * R * ratio).toFixed(1),
              ];
              const poly = (arr: typeof curve) =>
                arr.map((p, i) => pt(i, Math.min(p.heat, scaleMax) / scaleMax).join(',')).join(' ');
              return (
                <>
                  {[0.25, 0.5, 0.75, 1].map((r) => (
                    <polygon
                      key={r}
                      points={curve.map((_, i) => pt(i, r).join(',')).join(' ')}
                      fill="none" stroke="var(--border-c)" strokeWidth={r === 1 ? 1.2 : 0.8}
                    />
                  ))}
                  {curve.map((p, i) => {
                    const [x, y] = pt(i, 1);
                    return <line key={`ax-${p.name}`} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border-c)" strokeWidth={0.8} />;
                  })}
                  {compare && (
                    <polygon points={poly(compareCurve)} fill={COMPARE_COLOR} fillOpacity={0.08} stroke={COMPARE_COLOR} strokeWidth={1.4} strokeDasharray="5 3" />
                  )}
                  <polygon points={poly(curve)} fill="var(--ink-deep)" fillOpacity={0.08} stroke="var(--ink-deep)" strokeWidth={1.8} />
                  {curve.map((p, i) => {
                    const [lx, ly] = pt(i, 1.18);
                    return (
                      <text
                        key={`lb-${p.name}`} x={lx} y={ly + 3} textAnchor="middle" fontSize={9}
                        fill={i === di ? 'var(--ink-deep)' : 'var(--ink-soft)'}
                        fontWeight={i === di ? 600 : 400}
                      >
                        {p.name}
                      </text>
                    );
                  })}
                </>
              );
            })()}
          </svg>
        )}

        {/* 树状：面积＝含该意象的诗数，看它在各朝代的构成占比 */}
        {chart === 'tree' && (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="朝代构成树状图">
            {(() => {
              const cols = compare ? [focus, compare] : [focus];
              const colW = (IW - (cols.length - 1) * 12) / cols.length;
              return cols.map((c, ci) => {
                const series = curveOf(c);
                const total = series.reduce((s, p) => s + p.count, 0) || 1;
                const isFocus = c === focus;
                let y = PAD.t;
                return (
                  <g key={c}>
                    {series.map((p, i) => {
                      const h = (IH * p.count) / total;
                      const yTop = y;
                      y += h;
                      return (
                        <g
                          key={p.name}
                          className={isFocus ? 'cursor-pointer' : undefined}
                          onClick={isFocus ? () => pickDynasty(i) : undefined}
                        >
                          <rect
                            x={PAD.l + ci * (colW + 12)} y={yTop} width={colW} height={Math.max(h - 1, 0.6)} rx={2}
                            fill={isFocus ? 'var(--ink-deep)' : COMPARE_COLOR}
                            opacity={isFocus ? (i === di ? 0.85 : 0.42) : 0.38}
                          >
                            <title>{`${c} · ${p.name}：${p.count.toLocaleString()} 首`}</title>
                          </rect>
                          {h >= 22 && (
                            <text
                              x={PAD.l + ci * (colW + 12) + 6} y={yTop + h / 2 + 3.5} fontSize={9.5}
                              fill="var(--paper)" pointerEvents="none"
                            >
                              {p.name} {Math.round((p.count / total) * 100)}%
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              });
            })()}
          </svg>
        )}

        {compare && (
          <div className="mt-1 flex items-center gap-4 font-ui text-[11px] text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-0.5 w-5" style={{ background: 'var(--ink-deep)' }} /> {focus}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-0.5 w-5" style={{ background: COMPARE_COLOR }} /> {compare}
            </span>
          </div>
        )}

        {uninhabited.length > 0 && (
          <div className="mt-1 flex items-center gap-1.5 font-ui text-[11px] text-ink-soft">
            <i className="inline-block h-2 w-2 rounded-full border border-dashed" style={{ borderColor: 'var(--ink-soft)' }} />
            基线上的虚线圈＝该朝诗库不足 {MIN_SAMPLE} 首，样本不足，不画入曲线
          </div>
        )}

        <div className="mt-3 flex items-start gap-2 rounded-md bg-paper-dark p-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-blue" />
          <p className="font-ui text-xs leading-relaxed text-ink-soft">
            热度 = 该朝代每万首诗中含「{focus}」的诗数，消除诗库规模差异后可直接比较。
            {peak && peak.heat > 0 && `「${focus}」在${peak.name}代达到峰值（${peak.heat.toLocaleString()}/万首，共 ${peak.count.toLocaleString()} 首）。`}
            {tsDelta !== null && ` 从唐到宋，「${focus}」热度${tsDelta >= 0 ? '上升' : '回落'} ${Math.abs(tsDelta)}%。`}
            <br />
            {chart === 'tree'
              ? '树状图改用「含该意象的诗数」口径：面积即该朝篇数占比，不与每万首热度混用。'
              : `当前图表口径：每万首热度${chart === 'radar' ? '（七个朝代各为一维，形状差异即结构差异）' : ''}${chart === 'bar' ? '（同朝两意象并排，落差即对比）' : ''}。`}
            {' '}口径：本页对全库正文逐诗扫描，「含该字」即计 1 首，与「数据大屏」中基于意象标注集的矩阵不是同一口径。
            {uninhabited.length > 0 && ` ${uninhabited.map((d) => `${d.name}(${d.poems}首)`).join('、')} 样本低于 ${MIN_SAMPLE} 首，其热度不参与峰值与涨跌结论。`}
            数据由全库逐诗扫描预计算（{data.generatedAt}）。
          </p>
        </div>
      </div>
    </div>
  );
}
