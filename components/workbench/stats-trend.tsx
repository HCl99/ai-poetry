'use client';

import { useState } from 'react';

interface Day { label: string; count: number }

const RANGES = [7, 14, 30] as const;

/** 趋势的三种看法：折线看走向、柱状看单日量、热力看断续分布 */
const MODES = [
  { key: 'line', label: '折线' },
  { key: 'bar', label: '柱状' },
  { key: 'heat', label: '热力' },
] as const;

/**
 * 检索热力趋势：面积折线，可切 7/14/30 天。
 * 用 SVG 手绘而非图表库——体积零增加，与纸面配色同源，且能精确控制中文字号与刻度。
 */
export function StatsTrend({ data, logTotal }: { data: Day[]; logTotal: number }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [mode, setMode] = useState<(typeof MODES)[number]['key']>('line');
  const days = data.slice(-range);
  const max = Math.max(...days.map((d) => d.count), 1);
  const total = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;

  const W = 640, H = 180, PL = 10, PR = 12, PT = 20, PB = 26;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const baseY = PT + innerH;
  const x = (i: number) => PL + (days.length > 1 ? (i / (days.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => baseY - (v / max) * innerH;

  const line = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(' ');
  const area = `${line} L${x(days.length - 1).toFixed(1)},${baseY} L${x(0).toFixed(1)},${baseY} Z`;
  const labelStep = Math.ceil(days.length / 7);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-ui text-xs text-ink-soft">
          近 {range} 天累计 {total.toLocaleString()} 次 · {activeDays}/{days.length} 天有调用 · 全库共 {logTotal.toLocaleString()} 次
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className="rounded-full border-[1.5px] px-3 py-1 font-ui text-[11px] transition-ink"
              style={mode === m.key
                ? { borderColor: 'var(--ink-deep)', background: 'var(--ink-deep)', color: 'var(--paper)' }
                : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
            >
              {m.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px" style={{ background: 'var(--border-c)' }} />
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className="rounded-full border-[1.5px] px-3 py-1 font-ui text-[11px] transition-ink"
              style={range === r
                ? { background: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' }
                : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
            >
              {r} 天
            </button>
          ))}
        </div>
      </div>

      {mode === 'line' && (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`近 ${range} 天检索调用趋势`}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7B8EA1" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#7B8EA1" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1={PL} x2={W - PR} y1={baseY - innerH * p} y2={baseY - innerH * p}
            stroke="var(--border-c)" strokeWidth="1" strokeDasharray="3 4" />
        ))}
        <line x1={PL} x2={W - PR} y1={baseY} y2={baseY} stroke="var(--border-c)" strokeWidth="1" />

        <path d={area} fill="url(#trendFill)" />
        <path d={line} fill="none" stroke="#5D7185" strokeWidth="1.8" strokeLinejoin="round" />

        {days.map((d, i) => (
          <g key={d.label}>
            {d.count > 0 && <circle cx={x(i)} cy={y(d.count)} r="2.6" fill="#5D7185" />}
            {i % labelStep === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-soft)" fontFamily="inherit">
                {d.label}
              </text>
            )}
            {/* 透明热区：悬停显示当日次数 */}
            <rect x={x(i) - innerW / (days.length * 2)} y={PT} width={innerW / days.length} height={innerH}
              fill="transparent"><title>{`${d.label}：${d.count} 次`}</title></rect>
          </g>
        ))}
      </svg>
      )}

      {/* 柱状：单日量对比，峰值日一眼看出 */}
      {mode === 'bar' && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`近 ${range} 天每日调用柱状图`}>
          {[0.25, 0.5, 0.75].map((p) => (
            <line key={p} x1={PL} x2={W - PR} y1={baseY - innerH * p} y2={baseY - innerH * p}
              stroke="var(--border-c)" strokeWidth="1" strokeDasharray="3 4" />
          ))}
          <line x1={PL} x2={W - PR} y1={baseY} y2={baseY} stroke="var(--border-c)" strokeWidth="1" />
          {days.map((d, i) => {
            const bw = Math.max(2, (innerW / days.length) * 0.58);
            const h = (d.count / max) * innerH;
            return (
              <g key={d.label}>
                <rect x={x(i) - bw / 2} y={baseY - Math.max(h, 1)} width={bw} height={Math.max(h, 1)} rx={1.5}
                  fill="#5D7185" opacity={d.count === max && max > 0 ? 0.9 : 0.6}>
                  <title>{`${d.label}：${d.count} 次`}</title>
                </rect>
                {i % labelStep === 0 && (
                  <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--ink-soft)" fontFamily="inherit">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {/* 热力：断续与空档比曲线更直观 */}
      {mode === 'heat' && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`近 ${range} 天调用热力分布`}>
          {days.map((d, i) => {
            const cell = innerW / days.length;
            const size = Math.min(cell - 2, 30);
            const cx = x(i);
            const cy = PT + innerH / 2;
            const ratio = max > 0 ? d.count / max : 0;
            return (
              <g key={d.label}>
                <rect
                  x={cx - size / 2} y={cy - size / 2} width={size} height={size} rx={3}
                  fill="#5D7185" opacity={d.count === 0 ? 0.06 : 0.12 + ratio * 0.78}
                >
                  <title>{`${d.label}：${d.count} 次`}</title>
                </rect>
                {size >= 20 && d.count > 0 && (
                  <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={9.5}
                    fill={ratio > 0.55 ? 'var(--paper)' : 'var(--ink-mid)'} fontFamily="inherit">
                    {d.count}
                  </text>
                )}
                {i % labelStep === 0 && (
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--ink-soft)" fontFamily="inherit">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
