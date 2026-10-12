'use client';

import { useMemo, useState } from 'react';
import { MapPin, TrendingUp, Quote, Info } from 'lucide-react';

export interface TimelineData {
  dynasties: { name: string; poems: number }[];
  chars: string[];
  matrix: Record<string, Record<string, number>>;
  examples: Record<string, Record<string, { line: string; title: string; author: string }[]>>;
  generatedAt: string;
}

const PRESET_CHARS = ['月', '风', '花', '梅', '柳', '雁', '雪', '江'];
const BAR_COLORS = ['#7B8EA1', '#6B8E7B', '#8B7355', '#A67C7C', '#C4A965', '#9C9487'];

/** 每万首诗中含该意象的诗数（跨朝代可比的热度口径） */
function heat(count: number, poems: number) {
  return poems > 0 ? Math.round((count / poems) * 10000) : 0;
}

export function ImageryTimelineView({ data }: { data: TimelineData }) {
  const [di, setDi] = useState(() => Math.max(0, data.dynasties.findIndex((d) => d.name === '唐')));
  const [focus, setFocus] = useState('月');

  const dyn = data.dynasties[di];
  const smallSample = dyn.poems < 1000;

  // 当前朝代 Top12 意象
  const top = useMemo(() => {
    return data.chars
      .map((c) => ({ char: c, count: data.matrix[c]?.[dyn.name] ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [data, dyn.name]);
  const topMax = top[0]?.count || 1;

  // 焦点意象的跨朝代热度曲线
  const curve = useMemo(
    () =>
      data.dynasties.map((d) => ({
        name: d.name,
        count: data.matrix[focus]?.[d.name] ?? 0,
        heat: heat(data.matrix[focus]?.[d.name] ?? 0, d.poems),
      })),
    [data, focus],
  );
  const curveMax = Math.max(...curve.map((p) => p.heat), 1);
  const peak = curve.reduce((a, b) => (b.heat > a.heat ? b : a), curve[0]);

  // 唐→宋 变迁洞察
  const tang = curve.find((p) => p.name === '唐');
  const song = curve.find((p) => p.name === '宋');
  const tsDelta = tang && song && tang.heat > 0 ? Math.round(((song.heat - tang.heat) / tang.heat) * 100) : null;

  const examples = data.examples[focus]?.[dyn.name] ?? [];

  // SVG 曲线几何（viewBox 560x190，与 RAG 评测曲线同一风格）
  const W = 560;
  const H = 190;
  const PAD = { l: 46, r: 16, t: 18, b: 28 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const pts = curve.map((p, i) => ({
    ...p,
    x: +(PAD.l + (iw * i) / Math.max(curve.length - 1, 1)).toFixed(2),
    y: +(PAD.t + ih - (ih * p.heat) / curveMax).toFixed(2),
  }));
  const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">意象时空地图</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          全库 {data.dynasties.reduce((s, d) => s + d.poems, 0).toLocaleString()} 首诗 · {data.chars.length} 个核心意象 · 拖动朝代滑块，看意象热度的千年演变
        </p>
      </div>

      {/* 朝代滑块 */}
      <div className="paper-card p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="font-brush text-4xl text-ink-deep">{dyn.name}</div>
            <div className="mt-1 font-ui text-xs text-ink-soft">
              本朝诗库 {dyn.poems.toLocaleString()} 首
              {smallSample && <span className="ml-2 text-[#A67C7C]">样本较少，热度仅供参考</span>}
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
          onChange={(e) => setDi(+e.target.value)}
          className="w-full accent-[#8B7355]"
          aria-label="朝代滑块"
        />
        <div className="mt-1 flex justify-between">
          {data.dynasties.map((d, i) => (
            <button
              key={d.name}
              onClick={() => setDi(i)}
              className={`font-ui text-xs transition-ink ${i === di ? 'font-medium text-ink-deep' : 'text-ink-soft hover:text-ink-deep'}`}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 当前朝代 Top 意象 */}
        <div className="paper-card p-6">
          <h2 className="mb-4 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <MapPin className="h-4 w-4 text-muted-blue" /> {dyn.name}代热门意象 Top{top.length}
          </h2>
          <div className="space-y-2.5">
            {top.map((t, i) => (
              <button
                key={t.char}
                onClick={() => setFocus(t.char)}
                className="group flex w-full items-center gap-3 text-left"
                title={`查看「${t.char}」的朝代演变`}
              >
                <span className={`w-6 text-center font-brush text-lg ${t.char === focus ? 'text-[#8B7355]' : 'text-ink-deep'}`}>
                  {t.char}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-[#EDE8DD]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(3, Math.round((t.count / topMax) * 100))}%`,
                      background: t.char === focus ? '#8B7355' : BAR_COLORS[i % BAR_COLORS.length],
                      opacity: t.char === focus ? 1 : 0.75,
                    }}
                  />
                </div>
                <span className="w-20 text-right font-ui text-xs text-ink-soft">
                  {t.count.toLocaleString()} 首
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 font-ui text-xs text-ink-soft">点击任意意象，下方查看它的千年演变曲线</p>
        </div>

        {/* 例句 */}
        <div className="paper-card p-6">
          <h2 className="mb-4 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <Quote className="h-4 w-4 text-muted-blue" /> 「{focus}」在{dyn.name}代的诗句
          </h2>
          {examples.length ? (
            <div className="space-y-4">
              {examples.map((ex, i) => (
                <div key={i} className="border-l-2 pl-4" style={{ borderColor: BAR_COLORS[i % BAR_COLORS.length] }}>
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
          {/* 快捷意象 */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-[#EDE8DD] pt-4">
            {PRESET_CHARS.map((c) => (
              <button
                key={c}
                onClick={() => setFocus(c)}
                className={`rounded-full px-3 py-1 font-brush text-sm transition-ink ${
                  c === focus ? 'bg-[#8B7355] text-[#F7F3EA]' : 'bg-[#EDE8DD] text-ink-deep hover:bg-[#E2DACA]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 演变曲线 */}
      <div className="paper-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <TrendingUp className="h-4 w-4 text-muted-blue" /> 「{focus}」的千年演变 · 每万首热度
          </h2>
          <div className="font-ui text-xs text-ink-soft">
            峰值：<span className="font-medium text-ink-deep">{peak.name}代 {peak.heat.toLocaleString()}/万首</span>
            {tsDelta !== null && (
              <span className="ml-3">
                唐→宋 <span className={tsDelta >= 0 ? 'text-[#6B8E7B]' : 'text-[#A67C7C]'}>{tsDelta >= 0 ? '+' : ''}{tsDelta}%</span>
              </span>
            )}
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {/* 网格 */}
          {[0, 0.5, 1].map((r) => {
            const y = +(PAD.t + ih - ih * r).toFixed(2);
            return (
              <g key={r}>
                <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#EDE8DD" strokeWidth={1} />
                <text x={PAD.l - 6} y={y + 3.5} textAnchor="end" fontSize={9} fill="#9C9487">
                  {Math.round(curveMax * r).toLocaleString()}
                </text>
              </g>
            );
          })}
          {/* 面积 */}
          <polygon
            points={`${PAD.l},${PAD.t + ih} ${polyline} ${W - PAD.r},${PAD.t + ih}`}
            fill="#8B7355"
            opacity={0.08}
          />
          <polyline points={polyline} fill="none" stroke="#8B7355" strokeWidth={2} strokeLinejoin="round" />
          {pts.map((p, i) => (
            <g key={p.name}>
              <circle
                cx={p.x} cy={p.y} r={i === di ? 5 : 3.5}
                fill={i === di ? '#8B7355' : '#F7F3EA'} stroke="#8B7355" strokeWidth={1.5}
                className="cursor-pointer"
                onClick={() => setDi(i)}
              />
              <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill="#5D5853">
                {p.heat.toLocaleString()}
              </text>
              <text x={p.x} y={H - 8} textAnchor="middle" fontSize={10} fill={i === di ? '#8B7355' : '#9C9487'} fontWeight={i === di ? 600 : 400}>
                {p.name}
              </text>
            </g>
          ))}
        </svg>
        <div className="mt-3 flex items-start gap-2 rounded-md bg-[#F4F0E6] p-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-blue" />
          <p className="font-ui text-xs leading-relaxed text-ink-soft">
            热度 = 该朝代每万首诗中含「{focus}」的诗数，消除各朝代诗库规模差异后可直接比较。
            「{focus}」在{peak.name}代达到峰值（{peak.heat.toLocaleString()}/万首，共 {peak.count.toLocaleString()} 首）。
            {tsDelta !== null && ` 从唐到宋，「${focus}」热度${tsDelta >= 0 ? '上升' : '回落'} ${Math.abs(tsDelta)}%，折射两代审美趣味的变迁。`}
            数据由全库逐诗扫描预计算（{data.generatedAt}）。
          </p>
        </div>
      </div>
    </div>
  );
}
