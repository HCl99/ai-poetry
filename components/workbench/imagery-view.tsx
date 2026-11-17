'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, Network, BookOpen, Clock, Sparkles, Box, RotateCw, RotateCcw } from 'lucide-react';
import { GraphQaPanel } from './graph-qa';

interface ImageryItem { char: string; count: number }
interface Edge { source: string; target: string; weight: number }
interface FactQuote { id: string; title: string; author: string; dynasty: string; line: string }
interface FactData { char: string; meaning: string; notes: string[]; quotes: FactQuote[] }

const NODE_COLORS = ['var(--sage)', 'var(--sepia)', 'var(--muted-blue)', 'var(--rose)', 'var(--gold-wash)', 'var(--ink-mid)'];

/** 语义色轻着色 / 明暗主题下可读的同色系文字 */
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
const readable = (c: string) => `color-mix(in srgb, ${c} 70%, var(--ink-deep))`;

const CULTURE_NOTES: Record<string, { t: string; d: string; c: string }[]> = {
  月: [
    { t: '月 → 乡愁', d: '"举头望明月，低头思故乡"，明月是千年乡愁的文化密码。', c: 'var(--sage)' },
    { t: '月 → 孤独', d: '月下独酌、对影成三人，明月是孤独者的唯一知己。', c: 'var(--sepia)' },
    { t: '月 → 秋', d: '中秋之月承载团圆之意，秋月清冷映照羁旅愁思。', c: 'var(--rose)' },
  ],
};

// 画布逻辑坐标与三维透视参数；节点分布在球面而非平面圆环上
const W = 720, H = 420, CX = W / 2, CY = H / 2;
const MAX_NODES = 12;
const SPHERE_R = 150;
const FOCAL = 540;
const round2 = (v: number) => Math.round(v * 100) / 100;

type Rotation = { x: number; y: number };

/** 三维点先绕 Y/X 轴旋转，再做透视投影；z 越大离观察者越近 */
function projectPoint(bx: number, by: number, bz: number, rot: Rotation) {
  const cy = Math.cos(rot.y), sy = Math.sin(rot.y);
  const x1 = bx * cy + bz * sy;
  const z1 = -bx * sy + bz * cy;
  const cx = Math.cos(rot.x), sx = Math.sin(rot.x);
  const y1 = by * cx - z1 * sx;
  const z2 = by * sx + z1 * cx;
  const scale = FOCAL / (FOCAL - z2);
  return {
    x: round2(CX + x1 * scale),
    y: round2(CY + y1 * scale),
    s: round2(scale),
    z: round2(z2),
  };
}

export function ImageryView({ imagery, edges, initialFocus }: {
  imagery: ImageryItem[];
  edges: Edge[];
  initialFocus: string;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState(initialFocus);
  const [hover, setHover] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [facts, setFacts] = useState<FactData | null>(null);
  const [factsLoading, setFactsLoading] = useState(false);
  const [rot, setRot] = useState({ x: -0.42, y: 0.3 });
  const [spin, setSpin] = useState(true);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);

  // 自动环绕让纵深持续可见；拖拽时暂停，松手后继续
  useEffect(() => {
    if (!spin || dragging) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      setRot((r) => ({ ...r, y: r.y + dt * 0.00028 }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin, dragging]);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY };
    didDragRef.current = false;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) didDragRef.current = true;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setRot((r) => ({
      x: Math.max(-1.1, Math.min(1.1, r.x + dy * 0.007)),
      y: r.y + dx * 0.009,
    }));
  }
  function onPointerUp() {
    dragRef.current = null;
    setDragging(false);
  }

  const maxCount = imagery[0]?.count || 1;
  const countOf = (c: string) => imagery.find((i) => i.char === c)?.count ?? 0;

  // 全部共现边中与当前意象相连的部分（不再截断，避免「该意象暂无共现数据」的假空）
  const allNeighbors = useMemo(() => {
    const ns: { char: string; weight: number }[] = [];
    for (const e of edges) {
      if (e.source === focus) ns.push({ char: e.target, weight: e.weight });
      else if (e.target === focus) ns.push({ char: e.source, weight: e.weight });
    }
    return ns.sort((a, b) => b.weight - a.weight);
  }, [edges, focus]);

  const nodes = useMemo(() => allNeighbors.slice(0, MAX_NODES), [allNeighbors]);
  const maxWeight = nodes[0]?.weight || 1;

  // 斐波那契球面分布：每个节点都有独立的三维坐标，不再是平面内外双环
  const nodes3d = useMemo(() => {
    const n = nodes.length;
    return nodes.map((node, i) => {
      const k = n > 1 ? i / (n - 1) : 0.5;
      const yy = 1 - k * 2;
      const ring = Math.sqrt(Math.max(0, 1 - yy * yy));
      const theta = i * 2.399963229728653;
      return {
        ...node,
        bx: SPHERE_R * ring * Math.cos(theta),
        by: -yy * SPHERE_R,
        bz: SPHERE_R * ring * Math.sin(theta),
      };
    });
  }, [nodes]);

  const projectedNodes = useMemo(() => nodes3d.map((node, i) => {
    const p = projectPoint(node.bx, node.by, node.bz, rot);
    const depth = Math.max(0.4, Math.min(1, 0.4 + 0.6 * ((p.z + SPHERE_R) / (SPHERE_R * 2))));
    return {
      ...node,
      ...p,
      depth: round2(depth),
      color: NODE_COLORS[i % NODE_COLORS.length],
    };
  }).sort((a, b) => a.z - b.z), [nodes3d, rot]);

  // 经纬线同样经过三维旋转和投影，提供清晰的球体空间参照
  const sphereGrid = useMemo(() => {
    const back: string[] = [];
    const front: string[] = [];
    const append = (points: [number, number, number][]) => {
      for (let i = 1; i < points.length; i++) {
        const a = projectPoint(...points[i - 1], rot);
        const b = projectPoint(...points[i], rot);
        const segment = `M${a.x},${a.y}L${b.x},${b.y}`;
        ((a.z + b.z) / 2 < 0 ? back : front).push(segment);
      }
    };

    for (const latitude of [-0.6, 0, 0.6]) {
      const y = SPHERE_R * latitude;
      const r = SPHERE_R * Math.sqrt(1 - latitude * latitude);
      const points: [number, number, number][] = Array.from({ length: 65 }, (_, i) => {
        const angle = (i / 64) * Math.PI * 2;
        return [r * Math.cos(angle), y, r * Math.sin(angle)];
      });
      append(points);
    }

    for (let j = 0; j < 4; j++) {
      const longitude = (j / 4) * Math.PI;
      const points: [number, number, number][] = Array.from({ length: 65 }, (_, i) => {
        const angle = (i / 64) * Math.PI * 2;
        return [
          SPHERE_R * Math.sin(angle) * Math.cos(longitude),
          SPHERE_R * Math.cos(angle),
          SPHERE_R * Math.sin(angle) * Math.sin(longitude),
        ];
      });
      append(points);
    }
    return { back: back.join(''), front: front.join('') };
  }, [rot]);

  const relatedPoemCount = countOf(focus);
  const notes = CULTURE_NOTES[focus] || allNeighbors.slice(0, 3).map((n, i) => ({
    t: `${focus} → ${n.char}`,
    d: `「${focus}」与「${n.char}」在诗库中共现 ${n.weight} 次，构成典型的诗歌意象组合。`,
    c: NODE_COLORS[i % NODE_COLORS.length],
  }));

  /** 切换焦点并同步 URL，保证刷新/分享后停在同一个意象 */
  function goTo(next: string, pushHistory = true) {
    if (next === focus) return;
    if (pushHistory) setHistory((h) => [...h, focus]);
    setHover(null);
    setFocus(next);
    router.replace(`/workbench/imagery?focus=${encodeURIComponent(next)}`, { scroll: false });
  }

  function goBack() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setHover(null);
    setFocus(prev);
    router.replace(`/workbench/imagery?focus=${encodeURIComponent(prev)}`, { scroll: false });
  }

  // focus 变化时拉取该意象的字义、注释、名句
  useEffect(() => {
    let cancelled = false;
    setFactsLoading(true);
    fetch(`/api/imagery/facts?char=${encodeURIComponent(focus)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setFacts(d); })
      .catch(() => { if (!cancelled) setFacts(null); })
      .finally(() => { if (!cancelled) setFactsLoading(false); });
    return () => { cancelled = true; };
  }, [focus]);

  // 节点半径 ∝ log(出现篇数)，透视缩放进一步体现近大远小
  const nodeR = (c: string) => 14 + 12 * (Math.log(countOf(c) + 1) / Math.log(maxCount + 1));

  function renderNode(n: (typeof projectedNodes)[number]) {
    const r = nodeR(n.char);
    const active = hover === n.char;
    return (
      <g
        key={`n-${n.char}`}
        transform={`translate(${n.x},${n.y}) scale(${n.s})`}
        opacity={hover && !active ? 0.28 : active ? 1 : n.depth}
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        aria-label={`切换到意象「${n.char}」`}
        onMouseEnter={() => setHover(n.char)}
        onMouseLeave={() => setHover((h) => (h === n.char ? null : h))}
        onClick={() => { if (!didDragRef.current) goTo(n.char); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            goTo(n.char);
          }
        }}
      >
        <circle cx={1.5} cy={2.5} r={r} fill="var(--ink-deep)" opacity={0.14} />
        <circle
          r={r}
          style={{ fill: tint(n.color, active ? 38 : 20), stroke: readable(n.color) }}
          strokeWidth={active ? 2 : 1}
        />
        <circle r={r} fill="url(#imagery-node-light)" pointerEvents="none" />
        <text textAnchor="middle" dominantBaseline="central" fontSize={16} style={{ fill: readable(n.color) }} className="font-brush" pointerEvents="none">
          {n.char}
        </text>
        <text y={r + 11} textAnchor="middle" fontSize={10} style={{ fill: 'var(--ink-soft)' }} className="font-ui" pointerEvents="none">
          {n.weight.toLocaleString()}
        </text>
      </g>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">意象图谱</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          可视化 {imagery.length} 个核心意象的全库 {edges.length.toLocaleString()} 条共现关系，探索文化符号的深层联系
        </p>
      </div>

      {/* 画布 */}
      <div className="paper-card relative h-[420px] overflow-hidden">
        {history.length > 0 && (
          <button
            onClick={goBack}
            className="absolute left-4 top-4 z-20 inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-ui text-[11px] text-ink-mid transition-ink hover:bg-paper-dark"
            style={{ background: 'var(--inset)' }}
          >
            <ArrowLeft className="h-3 w-3" /> 返回「{history[history.length - 1]}」
          </button>
        )}

        <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5">
          <div className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-ui text-[11px] text-ink-mid" style={{ background: 'var(--inset)' }}>
            <Box className="h-3.5 w-3.5" /> 3D 共现球
          </div>
          <button
            onClick={() => setSpin((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-mid transition-ink hover:bg-paper-dark"
            style={{ background: 'var(--inset)' }}
            title={spin ? '暂停自动旋转' : '开启自动旋转'}
            aria-label={spin ? '暂停自动旋转' : '开启自动旋转'}
            aria-pressed={spin}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setRot({ x: -0.42, y: 0.3 })}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-mid transition-ink hover:bg-paper-dark"
            style={{ background: 'var(--inset)' }}
            title="重置三维视角"
            aria-label="重置三维视角"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-full w-full select-none"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`意象「${focus}」的三维共现关系球面图，可拖拽旋转`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          <defs>
            <radialGradient id="imagery-sphere-bg" cx="34%" cy="27%" r="76%">
              <stop offset="0%" stopColor="var(--paper)" stopOpacity={0.96} />
              <stop offset="62%" stopColor="var(--paper-dark)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--muted-blue)" stopOpacity={0.14} />
            </radialGradient>
            <radialGradient id="imagery-node-light" cx="30%" cy="24%" r="78%">
              <stop offset="0%" stopColor="#fff" stopOpacity={0.52} />
              <stop offset="48%" stopColor="#fff" stopOpacity={0.06} />
              <stop offset="100%" stopColor="var(--ink-deep)" stopOpacity={0.2} />
            </radialGradient>
            <radialGradient id="imagery-focus-light" cx="30%" cy="24%" r="78%">
              <stop offset="0%" stopColor="#fff" stopOpacity={0.28} />
              <stop offset="60%" stopColor="#fff" stopOpacity={0} />
              <stop offset="100%" stopColor="var(--ink-deep)" stopOpacity={0.28} />
            </radialGradient>
          </defs>

          <ellipse cx={CX} cy={CY + 164} rx={135} ry={15} fill="var(--ink-deep)" opacity={0.055} pointerEvents="none" />
          <circle
            cx={CX}
            cy={CY}
            r={SPHERE_R + 16}
            fill="url(#imagery-sphere-bg)"
            stroke="var(--border-c)"
            strokeWidth={1}
            opacity={0.92}
            pointerEvents="none"
          />
          <path d={sphereGrid.back} fill="none" stroke="var(--muted-blue)" strokeWidth={0.7} opacity={0.15} pointerEvents="none" />

          {projectedNodes.map((n) => (
            <line
              key={`e-${n.char}`}
              x1={CX}
              y1={CY}
              x2={n.x}
              y2={n.y}
              stroke={hover === n.char ? 'var(--gold-wash)' : readable(n.color)}
              strokeWidth={round2((hover === n.char ? 2.6 : 0.8 + Math.min(3.2, (n.weight / maxWeight) * 3.2)) * n.s)}
              strokeLinecap="round"
              opacity={hover && hover !== n.char ? 0.12 : round2(n.depth * 0.58)}
              pointerEvents="none"
            />
          ))}

          {/* 远侧节点先绘制，中心意象会自然遮住它们；近侧节点最后绘制 */}
          {projectedNodes.filter((n) => n.z < 0).map(renderNode)}

          <g transform={`translate(${CX},${CY})`} pointerEvents="none">
            <circle r={43} fill="none" stroke="var(--gold-wash)" strokeWidth={1} opacity={0.34} />
            <circle cx={2} cy={3} r={36} fill="var(--ink-deep)" opacity={0.18} />
            <circle r={36} style={{ fill: 'var(--btn-bg)' }} />
            <circle r={36} fill="url(#imagery-focus-light)" />
            <text textAnchor="middle" dominantBaseline="central" fontSize={23} style={{ fill: 'var(--btn-text)' }} className="font-brush">
              {focus}
            </text>
          </g>

          <path d={sphereGrid.front} fill="none" stroke="var(--muted-blue)" strokeWidth={0.8} opacity={0.2} pointerEvents="none" />
          {projectedNodes.filter((n) => n.z >= 0).map(renderNode)}
        </svg>

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center font-ui text-sm text-ink-soft">该意象暂无共现数据</div>
        )}
      </div>

      <p className="!mt-2 px-1 font-ui text-[11px] text-ink-soft">
        拖拽旋转球体 · 点击意象切换中心 · 近大远小表示空间深度；线宽与数字 = 共现频次，圆大小 = 意象出现篇数
      </p>

      {/* 统计 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { num: relatedPoemCount.toLocaleString(), label: `含「${focus}」诗词` },
          { num: String(allNeighbors.length), label: '关联意象' },
          { num: nodes[0] ? `${nodes[0].weight.toLocaleString()}` : '0', label: `最高共现（${nodes[0]?.char ?? '-'}）` },
          { num: imagery.length, label: '意象总数' },
        ].map((s) => (
          <div key={s.label} className="paper-card p-5 text-center">
            <div className="font-brush text-3xl text-ink-deep">{s.num}</div>
            <div className="mt-1 font-ui text-xs text-ink-soft">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 意象小传：字义 + 名句 + 文化内涵 */}
      <div className="paper-card p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <BookOpen className="h-4 w-4 text-sepia" /> 「{focus}」意象小传
          </h2>
          <button
            onClick={() => router.push(`/workbench/imagery-timeline?focus=${encodeURIComponent(focus)}`)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-ui text-[11px] text-ink-mid transition-ink hover:bg-paper-dark"
            style={{ background: 'var(--inset)' }}
          >
            <Clock className="h-3 w-3" /> 看朝代演变
          </button>
        </div>

        {factsLoading && <p className="font-ui text-sm text-ink-soft">加载中…</p>}

        {!factsLoading && facts && (
          <div className="space-y-4">
            {/* 字义速览 */}
            <div className="rounded-lg p-4" style={{ background: 'var(--inset)' }}>
              <div className="mb-1 flex items-center gap-1.5 font-ui text-xs font-medium text-sepia">
                <Sparkles className="h-3 w-3" /> 字义
              </div>
              <p className="font-serif text-sm leading-relaxed text-ink-deep">{facts.meaning}</p>
            </div>

            {/* 名句精选 */}
            {facts.quotes.length > 0 && (
              <div>
                <div className="mb-2 font-ui text-xs font-medium text-muted-blue">名句精选</div>
                <div className="space-y-2">
                  {facts.quotes.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => router.push(`/workbench/poem/${q.id}`)}
                      className="block w-full rounded-lg p-3 text-left transition-ink hover:-translate-y-0.5"
                      style={{ background: 'var(--paper-dark)' }}
                    >
                      <p className="font-serif text-sm leading-relaxed text-ink-deep">{q.line}</p>
                      <p className="mt-1 font-ui text-[11px] text-ink-soft">
                        〔{q.dynasty}〕{q.author}《{q.title}》
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 文化内涵 */}
            {facts.notes.length > 0 && (
              <div>
                <div className="mb-2 font-ui text-xs font-medium text-sage">文化内涵</div>
                <div className="space-y-2">
                  {facts.notes.map((n, i) => (
                    <div key={i} className="rounded-lg px-3 py-2 font-serif text-sm leading-relaxed text-ink-mid" style={{ borderLeft: '3px solid var(--sage)', background: 'var(--inset)' }}>
                      {n}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!factsLoading && !facts && (
          <p className="font-ui text-sm text-ink-soft">暂无该意象的详细资料</p>
        )}
      </div>

      {/* 意象频次 + 关联说明 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="paper-card p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
              <Network className="h-4 w-4 text-muted-blue" /> 意象快捷入口
            </h2>
            <button
              onClick={() => setShowAll((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-ui text-[11px] text-ink-mid transition-ink hover:bg-paper-dark"
              style={{ background: 'var(--inset)' }}
            >
              {showAll ? '收起' : `全部 ${imagery.length} 个`}
              <ChevronDown className={`h-3 w-3 transition-ink ${showAll ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
            {(showAll ? imagery : imagery.slice(0, 12)).map((im) => (
              <button
                key={im.char}
                onClick={() => goTo(im.char)}
                className="rounded-lg p-3 text-center transition-ink hover:-translate-y-0.5"
                style={focus === im.char ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' } : { background: 'var(--inset)' }}
              >
                <span className={`font-brush text-2xl ${focus === im.char ? '' : 'text-ink-deep'}`}>{im.char}</span>
                <p className={`mt-0.5 font-ui text-xs ${focus === im.char ? '' : 'text-ink-soft'}`} style={focus === im.char ? { color: 'var(--btn-text)', opacity: 0.75 } : {}}>
                  {im.count}
                </p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--paper-dark)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(im.count / maxCount) * 100}%`, background: focus === im.char ? 'var(--gold-wash)' : 'var(--muted-blue)' }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {notes.map((r, i) => (
            <div key={i} className="paper-card p-4" style={{ borderLeft: `3px solid ${r.c}` }}>
              <div className="font-ui text-sm font-medium" style={{ color: readable(r.c) }}>{r.t}</div>
              <p className="mt-1 font-ui text-sm leading-relaxed text-ink-mid">{r.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 图谱问答（GraphRAG）：随焦点意象切换上下文 */}
      <GraphQaPanel kind="imagery" focus={focus} />
    </div>
  );
}
