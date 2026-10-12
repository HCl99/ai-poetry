'use client';

import { useMemo, useState } from 'react';
import { Network } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';

interface ImageryItem { char: string; count: number }
interface Edge { source: string; target: string; weight: number }

const NODE_COLORS = ['#6B8E7B', '#8B7355', '#7B8EA1', '#A67C7C', '#C4A965', '#5D5853'];

const CULTURE_NOTES: Record<string, { t: string; d: string; c: string }[]> = {
  月: [
    { t: '月 → 乡愁', d: '"举头望明月，低头思故乡"，明月是千年乡愁的文化密码。', c: '#6B8E7B' },
    { t: '月 → 孤独', d: '月下独酌、对影成三人，明月是孤独者的唯一知己。', c: '#8B7355' },
    { t: '月 → 秋', d: '中秋之月承载团圆之意，秋月清冷映照羁旅愁思。', c: '#A67C7C' },
  ],
};

function positions(n: number) {
  // 围绕中心的均匀分布
  const arr: { x: string; y: string }[] = [];
  const presets = [
    { x: '22%', y: '20%' }, { x: '78%', y: '20%' }, { x: '50%', y: '8%' },
    { x: '18%', y: '75%' }, { x: '82%', y: '75%' }, { x: '88%', y: '48%' },
    { x: '12%', y: '48%' }, { x: '35%', y: '88%' }, { x: '65%', y: '88%' },
  ];
  for (let i = 0; i < n; i++) arr.push(presets[i % presets.length]);
  return arr;
}

export function ImageryView({ imagery, edges, initialFocus }: {
  imagery: ImageryItem[];
  edges: Edge[];
  initialFocus: string;
}) {
  const [focus, setFocus] = useState(initialFocus);
  const { msg, show } = useToast();

  const maxCount = imagery[0]?.count || 1;
  const neighbors = useMemo(() => {
    const ns: { char: string; weight: number }[] = [];
    for (const e of edges) {
      if (e.source === focus) ns.push({ char: e.target, weight: e.weight });
      else if (e.target === focus) ns.push({ char: e.source, weight: e.weight });
    }
    return ns.sort((a, b) => b.weight - a.weight).slice(0, 9);
  }, [edges, focus]);

  const relatedPoemCount = imagery.find((i) => i.char === focus)?.count ?? 0;
  const pos = positions(neighbors.length);
  const notes = CULTURE_NOTES[focus] || neighbors.slice(0, 3).map((n, i) => ({
    t: `${focus} → ${n.char}`,
    d: `「${focus}」与「${n.char}」在唐诗中共现 ${n.weight} 次，构成典型的诗歌意象组合。`,
    c: NODE_COLORS[i % NODE_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">意象图谱</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          可视化 {imagery.length} 个核心意象的 {edges.length} 条共现关系，探索文化符号的深层联系
        </p>
      </div>

      {/* 画布 */}
      <div className="paper-card relative h-[420px] overflow-hidden">
        <svg className="absolute inset-0 h-full w-full">
          {neighbors.map((n, i) => (
            <line key={n.char} x1="50%" y1="50%" x2={pos[i].x} y2={pos[i].y} stroke="#D4CFC5" strokeWidth={Math.min(3, 0.5 + n.weight / 2000)} />
          ))}
        </svg>
        {/* 中心节点 */}
        <div
          className="absolute left-1/2 top-1/2 z-10 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full font-brush text-2xl shadow-ink transition-ink"
          style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
          onClick={() => show(`核心意象「${focus}」`)}
        >
          {focus}
        </div>
        {/* 周围节点 */}
        {neighbors.map((n, i) => (
          <div
            key={n.char}
            className="absolute z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full font-brush text-lg transition-ink hover:scale-110"
            style={{ left: pos[i].x, top: pos[i].y, background: `${NODE_COLORS[i % NODE_COLORS.length]}26`, color: NODE_COLORS[i % NODE_COLORS.length] }}
            onClick={() => setFocus(n.char)}
            title={`切换到「${n.char}」`}
          >
            {n.char}
          </div>
        ))}
        {neighbors.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center font-ui text-sm text-ink-soft">该意象暂无共现数据</div>
        )}
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { num: relatedPoemCount.toLocaleString(), label: `含「${focus}」诗词` },
          { num: neighbors.length, label: '关联意象' },
          { num: neighbors[0] ? `${neighbors[0].weight}` : '0', label: `最高共现（${neighbors[0]?.char ?? '-'}）` },
          { num: imagery.length, label: '意象总数' },
        ].map((s) => (
          <div key={s.label} className="paper-card p-5 text-center">
            <div className="font-brush text-3xl text-ink-deep">{s.num}</div>
            <div className="mt-1 font-ui text-xs text-ink-soft">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 意象频次 + 关联说明 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="paper-card p-6">
          <h2 className="mb-4 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <Network className="h-4 w-4 text-muted-blue" /> 意象快捷入口
          </h2>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
            {imagery.slice(0, 12).map((im, i) => (
              <button
                key={im.char}
                onClick={() => setFocus(im.char)}
                className="rounded-lg p-3 text-center transition-ink hover:-translate-y-0.5"
                style={focus === im.char ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' } : { background: 'var(--inset)' }}
              >
                <span className={`font-brush text-2xl ${focus === im.char ? '' : 'text-ink-deep'}`}>{im.char}</span>
                <p className={`mt-0.5 font-ui text-xs ${focus === im.char ? '' : 'text-ink-soft'}`} style={focus === im.char ? { color: 'var(--btn-text)', opacity: 0.75 } : {}}>
                  {im.count}
                </p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: 'rgba(60,50,40,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(im.count / maxCount) * 100}%`, background: focus === im.char ? '#C4A965' : '#7B8EA1' }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {notes.map((r, i) => (
            <div key={i} className="paper-card p-4" style={{ borderLeft: `3px solid ${r.c}` }}>
              <div className="font-ui text-sm font-medium" style={{ color: r.c }}>{r.t}</div>
              <p className="mt-1 font-ui text-sm leading-relaxed text-ink-mid">{r.d}</p>
            </div>
          ))}
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
