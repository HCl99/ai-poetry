'use client';

import { useMemo, useState } from 'react';
import { Network } from 'lucide-react';

interface Edge { source: string; target: string; weight: number }

// Pastel 朝代配色（与用户偏好一致）
const DYNASTY_COLORS: Record<string, string> = {
  唐: '#C4A965',
  五代: '#A67C7C',
  宋: '#7B8EA1',
  元: '#8B7355',
  明: '#6B8E7B',
  清: '#5D5853',
};
const FALLBACK_COLOR = '#9B8E7E';

function colorOf(dynasty: string | undefined): string {
  if (!dynasty) return FALLBACK_COLOR;
  for (const k of Object.keys(DYNASTY_COLORS)) {
    if (dynasty.includes(k)) return DYNASTY_COLORS[k];
  }
  return FALLBACK_COLOR;
}

const W = 1000;
const H = 560;
const CX = W / 2;
const CY = H / 2;

export function PoetGraphView({ relations, dynastyMap, degreeMap, initialFocus }: {
  relations: Edge[];
  dynastyMap: Record<string, string>;
  degreeMap: Record<string, number>;
  initialFocus: string;
}) {
  const [focus, setFocus] = useState(initialFocus);

  const maxDegree = Math.max(...Object.values(degreeMap), 1);
  const maxWeight = relations[0]?.weight || 1;

  // 焦点的一度邻居（取关系最强的 12 位）
  const neighbors = useMemo(() => {
    const ns: { name: string; weight: number }[] = [];
    for (const e of relations) {
      if (e.source === focus) ns.push({ name: e.target, weight: e.weight });
      else if (e.target === focus) ns.push({ name: e.source, weight: e.weight });
    }
    return ns.sort((a, b) => b.weight - a.weight).slice(0, 12);
  }, [relations, focus]);

  // 邻居环绕布局（椭圆均匀分布，首节点在正上方）
  const layout = useMemo(() => {
    const rx = W * 0.36;
    const ry = H * 0.34;
    return neighbors.map((n, i) => {
      const angle = (i / neighbors.length) * Math.PI * 2 - Math.PI / 2;
      return {
        ...n,
        x: CX + rx * Math.cos(angle),
        y: CY + ry * Math.sin(angle),
      };
    });
  }, [neighbors]);

  // 邻居之间的边（同圈层关联，细虚线）
  const peerEdges = useMemo(() => {
    const inCircle = new Set(neighbors.map((n) => n.name));
    const pos = new Map(layout.map((n) => [n.name, n]));
    return relations
      .filter((e) => inCircle.has(e.source) && inCircle.has(e.target))
      .slice(0, 30)
      .map((e) => ({ ...e, a: pos.get(e.source)!, b: pos.get(e.target)! }));
  }, [relations, neighbors, layout]);

  const focusDegree = degreeMap[focus] || 0;
  const topPoets = useMemo(
    () => Object.entries(degreeMap).sort((a, b) => b[1] - a[1]).slice(0, 12),
    [degreeMap],
  );

  function radiusOf(name: string, isFocus = false): number {
    if (isFocus) return 44;
    const d = degreeMap[name] || 1;
    return 22 + (d / maxDegree) * 16;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">诗人图谱</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          基于 12,609 位诗人小传互提关系构建，可视化 {relations.length} 条诗人关联，探索诗人之间的师承、唱和与影响
        </p>
      </div>

      {/* 图谱画布 */}
      <div className="paper-card relative overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
          {/* 邻居间边 */}
          {peerEdges.map((e, i) => (
            <line
              key={`p${i}`}
              x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
              stroke="#D4CFC5" strokeWidth={1} strokeDasharray="4 4" opacity={0.5}
            />
          ))}
          {/* 中心到邻居的边 */}
          {layout.map((n) => (
            <line
              key={n.name}
              x1={CX} y1={CY} x2={n.x} y2={n.y}
              stroke={colorOf(dynastyMap[n.name])}
              strokeWidth={Math.max(1.5, (n.weight / maxWeight) * 8)}
              opacity={0.45}
            />
          ))}
          {/* 邻居节点 */}
          {layout.map((n) => {
            const r = radiusOf(n.name);
            const c = colorOf(dynastyMap[n.name]);
            return (
              <g key={n.name} className="cursor-pointer" onClick={() => setFocus(n.name)}>
                <circle cx={n.x} cy={n.y} r={r} fill={`${c}2E`} stroke={c} strokeWidth={1.5} />
                <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={n.name.length > 2 ? 12 : 14} fill={c} fontWeight={600}>
                  {n.name}
                </text>
                <text x={n.x} y={n.y + r + 14} textAnchor="middle" fontSize={10} fill="#8B857A">
                  {dynastyMap[n.name] || ''} · {n.weight} 次
                </text>
              </g>
            );
          })}
          {/* 中心焦点节点 */}
          <g className="cursor-pointer">
            <circle cx={CX} cy={CY} r={radiusOf(focus, true)} fill="#3A3835" />
            <text x={CX} y={CY + 6} textAnchor="middle" fontSize={focus.length > 2 ? 18 : 22} fill="#F5F2EC" fontWeight={700}>
              {focus}
            </text>
            <text x={CX} y={CY + radiusOf(focus, true) + 16} textAnchor="middle" fontSize={11} fill="#8B857A">
              {dynastyMap[focus] || ''} · 关联 {focusDegree} 位诗人
            </text>
          </g>
        </svg>
        {neighbors.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center font-ui text-sm text-ink-soft">该诗人暂无关联数据</div>
        )}
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { num: relations.length, label: '诗人关联边' },
          { num: Object.keys(degreeMap).length, label: '涉及诗人' },
          { num: focusDegree, label: `「${focus}」关联数` },
          { num: neighbors[0] ? `${neighbors[0].name} ×${neighbors[0].weight}` : '—', label: '最强关联' },
        ].map((s) => (
          <div key={s.label} className="paper-card p-5 text-center">
            <div className="font-brush text-3xl text-ink-deep">{s.num}</div>
            <div className="mt-1 font-ui text-xs text-ink-soft">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 快捷入口 + 关联明细 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="paper-card p-6">
          <h2 className="mb-4 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <Network className="h-4 w-4 text-muted-blue" /> 关联最广的诗人
          </h2>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
            {topPoets.map(([name, deg]) => {
              const c = colorOf(dynastyMap[name]);
              const active = focus === name;
              return (
                <button
                  key={name}
                  onClick={() => setFocus(name)}
                  className="rounded-lg p-3 text-center transition-ink hover:-translate-y-0.5"
                  style={active ? { background: '#3A3835', color: '#F5F2EC' } : { background: '#F5F2EC' }}
                >
                  <span className="font-brush text-2xl" style={active ? {} : { color: c }}>{name}</span>
                  <p className={`mt-0.5 font-ui text-xs ${active ? '' : 'text-ink-soft'}`} style={active ? { color: 'rgba(245,242,236,0.7)' } : {}}>
                    {dynastyMap[name] || ''} · {deg} 关联
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-ui text-[15px] font-medium text-ink-deep">「{focus}」的关系解读</h2>
          {neighbors.slice(0, 4).map((n) => {
            const c = colorOf(dynastyMap[n.name]);
            return (
              <div key={n.name} className="paper-card p-4" style={{ borderLeft: `3px solid ${c}` }}>
                <div className="font-ui text-sm font-medium" style={{ color: c }}>
                  {focus} ↔ {n.name}
                </div>
                <p className="mt-1 font-ui text-sm leading-relaxed text-ink-mid">
                  {dynastyMap[n.name] || ''}诗人{n.name}的小传与「{focus}」互提 {n.weight} 次，或为唱和交游、或为师承影响。
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
