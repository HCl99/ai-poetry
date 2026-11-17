'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Network, Search, RotateCw, Box } from 'lucide-react';
import { GraphQaPanel } from './graph-qa';

interface Edge { source: string; target: string; weight: number }

// Pastel 朝代配色（与用户偏好一致）
const DYNASTY_COLORS: Record<string, string> = {
  唐: '#C4A965',
  五代: '#A67C7C',
  宋: '#7B8EA1',
  元: '#8B7355',
  明: '#6B8E7B',
  清: '#9C9487',
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
const MAX_NEIGHBORS = 12;

/** 立体视图参数：焦距与环绕半径，决定透视强弱 */
const FOCAL = 780;
const RING_R = 300;
const TILT_MIN = -0.55;
const TILT_MAX = 0.55;

// SSR 与客户端浮点序列化精度不同，坐标统一截断避免水合告警
const round2 = (v: number) => Math.round(v * 100) / 100;

export function PoetGraphView({ relations, dynastyMap, degreeMap, poemCountMap, initialFocus, poetCount }: {
  relations: Edge[];
  dynastyMap: Record<string, string>;
  degreeMap: Record<string, number>;
  poemCountMap: Record<string, number>;
  initialFocus: string;
  poetCount: number;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState(initialFocus);
  const [history, setHistory] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, string[]>>({});
  const [evLoading, setEvLoading] = useState(false);

  // 立体视图：绕 Y 轴自转 + X 轴俯仰，可拖拽改变视角
  const [mode, setMode] = useState<'3d' | 'flat'>('3d');
  const [rot, setRot] = useState({ y: 0, x: -0.18 });
  const [spin, setSpin] = useState(true);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (mode !== '3d' || !spin || dragging) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      setRot((r) => ({ ...r, y: r.y + dt * 0.00018 }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, spin, dragging]);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (mode !== '3d') return;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setRot((r) => ({
      y: r.y + dx * 0.008,
      x: Math.max(TILT_MIN, Math.min(TILT_MAX, r.x + dy * 0.005)),
    }));
  }
  function onPointerUp() {
    dragRef.current = null;
    setDragging(false);
  }

  // 首次进入展示操作提示，关闭后不再出现
  useEffect(() => {
    if (!localStorage.getItem('graph-hint-seen')) setShowHint(true);
  }, []);
  function dismissHint() {
    localStorage.setItem('graph-hint-seen', '1');
    setShowHint(false);
  }

  const maxDegree = Math.max(...Object.values(degreeMap), 1);
  const maxWeight = relations[0]?.weight || 1;

  // 焦点的一度邻居（取关系最强的 12 位）
  const neighborsAll = useMemo(() => {
    const ns: { name: string; weight: number }[] = [];
    for (const e of relations) {
      if (e.source === focus) ns.push({ name: e.target, weight: e.weight });
      else if (e.target === focus) ns.push({ name: e.source, weight: e.weight });
    }
    return ns.sort((a, b) => b.weight - a.weight);
  }, [relations, focus]);
  const neighbors = useMemo(() => neighborsAll.slice(0, MAX_NEIGHBORS), [neighborsAll]);

  // 真三维布局：斐波那契球面分布，每个诗人有独立的 x/y/z，旋转时可穿过前后
  const nodes3d = useMemo(() => {
    const n = neighbors.length;
    const R = Math.min(RING_R, W * 0.26);
    return neighbors.map((nb, i) => {
      const k = n > 1 ? i / (n - 1) : 0.5;
      const yy = 1 - k * 2; // 1 → -1，纵向铺开
      const ring = Math.sqrt(Math.max(0, 1 - yy * yy));
      const th = i * 2.399963; // 黄金角，避免扎堆
      return {
        ...nb,
        angle: th,
        bx: R * ring * Math.cos(th),
        by: -yy * R * 0.74,
        bz: R * ring * Math.sin(th),
      };
    });
  }, [neighbors]);

  // 透视投影：先绕 Y 再绕 X，按焦距做近大远小；平面模式回落到椭圆环绕
  function project(bx: number, by: number, bz: number, angle: number) {
    if (mode === 'flat') {
      return {
        x: round2(CX + Math.cos(angle) * W * 0.34),
        y: round2(CY + Math.sin(angle) * H * 0.3),
        s: 1,
        z: 0,
      };
    }
    const cy1 = Math.cos(rot.y), sy1 = Math.sin(rot.y);
    const x1 = bx * cy1 + bz * sy1;
    const z1 = -bx * sy1 + bz * cy1;
    const cx1 = Math.cos(rot.x), sx1 = Math.sin(rot.x);
    const y1 = by * cx1 - z1 * sx1;
    const z2 = by * sx1 + z1 * cx1;
    const s = FOCAL / (FOCAL - z2);
    return { x: round2(CX + x1 * s), y: round2(CY + y1 * s), s: round2(s), z: round2(z2) };
  }

  // 邻居之间的边（同圈层关联，细虚线），位置在渲染时投影
  const peerPairs = useMemo(() => {
    const inCircle = new Set(neighbors.map((n) => n.name));
    return relations
      .filter((e) => inCircle.has(e.source) && inCircle.has(e.target))
      .slice(0, 30);
  }, [relations, neighbors]);

  const focusDegree = degreeMap[focus] || 0;
  const topPoets = useMemo(() => {
    const entries = Object.entries(degreeMap);
    // 先按「库内是否有较多作品」分层，再按关联数排序：小传记载详尽的冷门诗人不再占据榜单前列
    entries.sort((a, b) => {
      const pa = (poemCountMap[a[0]] || 0) >= 20 ? 1 : 0;
      const pb = (poemCountMap[b[0]] || 0) >= 20 ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b[1] - a[1];
    });
    return entries.slice(0, 12);
  }, [degreeMap, poemCountMap]);

  // 关系证据：切焦点时向服务端取双方小传原文中互提的句子
  const evidenceNames = neighbors.slice(0, 4).map((n) => n.name).join(',');
  useEffect(() => {
    if (!evidenceNames) return;
    let alive = true;
    setEvLoading(true);
    fetch(`/api/graph/evidence?focus=${encodeURIComponent(focus)}&names=${encodeURIComponent(evidenceNames)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setEvidence(d.evidence || {}); })
      .catch(() => { if (alive) setEvidence({}); })
      .finally(() => { if (alive) setEvLoading(false); });
    return () => { alive = false; };
  }, [focus, evidenceNames]);

  // 姓名联想：只在小传名单里搜，按关联数排序
  const suggestions = useMemo(() => {
    const kw = q.trim();
    if (!kw) return [];
    return Object.keys(dynastyMap)
      .filter((n) => n.includes(kw) && n !== focus)
      .sort((a, b) => (degreeMap[b] || 0) - (degreeMap[a] || 0))
      .slice(0, 8);
  }, [q, dynastyMap, degreeMap, focus]);

  /** 保留给平面视图的尺寸基准 */
  function radiusOf(name: string, isFocus = false): number {
    if (isFocus) return 44;
    const d = degreeMap[name] || 1;
    return round2(22 + (d / maxDegree) * 16);
  }
  /** 切换焦点并同步 URL，保证刷新/分享后仍停在同一诗人 */
  function goTo(name: string, pushHistory = true) {
    if (name === focus) return;
    if (pushHistory) setHistory((h) => [...h, focus]);
    setFocus(name);
    setQ('');
    router.replace(`/workbench/graph?focus=${encodeURIComponent(name)}`, { scroll: false });
  }

  function goBack() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setFocus(prev);
    setQ('');
    router.replace(`/workbench/graph?focus=${encodeURIComponent(prev)}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-brush text-3xl text-ink-black">诗人图谱</h1>
          <p className="mt-1.5 font-ui text-sm text-ink-soft">
            基于 {poetCount.toLocaleString()} 位诗人小传互提关系构建，可视化 {relations.length.toLocaleString()} 条诗人关联，探索诗人之间的师承、唱和与影响
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"><Search className="h-4 w-4" /></span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
            placeholder="搜索诗人，如：杜甫、李清照…"
            className="h-11 w-full rounded-lg border-[1.5px] border-c bg-white/70 pl-10 pr-3 font-ui text-sm outline-none transition-ink focus:border-ink-deep"
          />
          {suggestions.length > 0 && (
            <div className="glass-strong absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-c shadow-ink">
              {suggestions.map((name) => (
                <button
                  key={name}
                  onClick={() => goTo(name)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-ui text-sm text-ink-deep transition-ink hover:bg-paper-dark"
                >
                  <span className="font-brush text-base">{name}</span>
                  <span className="shrink-0 font-ui text-[11px] text-ink-soft">
                    {dynastyMap[name] || '未知'} · {degreeMap[name] ? `${degreeMap[name]} 关联` : '暂无关联'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 图谱画布 */}
      <div className="paper-card relative overflow-hidden">
        {history.length > 0 && (
          <button
            onClick={goBack}
            className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-ui text-[11px] text-ink-mid transition-ink hover:bg-paper-dark"
            style={{ background: 'var(--inset)' }}
          >
            <ArrowLeft className="h-3 w-3" /> 返回「{history[history.length - 1]}」
          </button>
        )}
        {showHint && (
          <div className="glass-strong absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full px-3.5 py-1.5 font-ui text-xs text-ink-mid shadow-ink anim-fade-up">
            <span>拖动可旋转视角 · 点击节点切换焦点诗人 · 连线越粗互提越多</span>
            <button onClick={dismissHint} className="text-ink-soft transition-ink hover:text-ink-deep" aria-label="知道了">✕</button>
          </div>
        )}
        {/* 窄屏下横向可滑动，避免整图等比缩小到读不出字 */}
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[700px] select-none"
            style={{ cursor: mode === '3d' ? (dragging ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            role="img"
            aria-label={`「${focus}」的诗人关系图`}
          >
            <defs>
              {/* 空气感背景：淡蓝渐层 + 中心柔光，让深色文字自然浮起 */}
              <linearGradient id="graphBg" x1="0" y1="0" x2="0.35" y2="1">
                <stop offset="0%" stopColor="#F8FBFE" />
                <stop offset="55%" stopColor="#E9F0F9" />
                <stop offset="100%" stopColor="#D8E3F2" />
              </linearGradient>
              <radialGradient id="graphGlow" cx="50%" cy="40%" r="62%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </radialGradient>
              {/* 远景文字轻微失焦，是这张图「远近」的关键 */}
              <filter id="depthBlur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="0.8" />
              </filter>
            </defs>

            <rect x={0} y={0} width={W} height={H} fill="url(#graphBg)" />
            <ellipse cx={CX} cy={CY - 10} rx={W * 0.52} ry={H * 0.55} fill="url(#graphGlow)" />

            {(() => {
              const INK = '#1F3E77';
              const projected = nodes3d.map((n) => ({ ...n, p: project(n.bx, n.by, n.bz, n.angle) }));
              const posMap = new Map(projected.map((n) => [n.name, n.p]));
              const ordered = [...projected].sort((a, b) => a.p.z - b.p.z);

              return (
                <>
                  {/* 圈内互提：极细虚线，几乎融进背景 */}
                  {peerPairs.map((e, i) => {
                    const a = posMap.get(e.source);
                    const b = posMap.get(e.target);
                    if (!a || !b) return null;
                    return (
                      <line
                        key={`p${i}`}
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke={INK} strokeWidth={0.6} strokeDasharray="3 5"
                        opacity={0.06 + Math.min(0.1, ((a.s + b.s) / 2 - 0.7) * 0.15)}
                      />
                    );
                  })}

                  {/* 中心放射线：发丝级细线，靠透明度与粗细暗示远近与权重 */}
                  {ordered.map((n) => {
                    const depthK = Math.max(0, Math.min(1, (n.p.z + RING_R) / (RING_R * 2)));
                    return (
                      <line
                        key={`e-${n.name}`}
                        x1={CX} y1={CY} x2={n.p.x} y2={n.p.y}
                        stroke={INK}
                        strokeWidth={round2(0.55 + (n.weight / maxWeight) * 1.1)}
                        opacity={round2(0.08 + depthK * 0.3)}
                      />
                    );
                  })}

                  {/* 邻居：小圆点 + 大字标签，近大远小、远景失焦 */}
                  {ordered.map((n) => {
                    const { x, y, s, z } = n.p;
                    const depthK = Math.max(0, Math.min(1, (z + RING_R) / (RING_R * 2)));
                    const dotR = round2((4.2 + ((degreeMap[n.name] || 1) / maxDegree) * 3.4) * s);
                    const fontSize = round2(Math.max(15, Math.min(34, 25 * s)));
                    const faded = s < 0.9;
                    return (
                      <g key={n.name} className="cursor-pointer" onClick={() => goTo(n.name)}>
                        <circle cx={x} cy={y} r={dotR} fill={INK} opacity={round2(0.45 + depthK * 0.55)}
                          filter={faded ? 'url(#depthBlur)' : undefined}>
                          <title>{`${n.name} · ${dynastyMap[n.name] || '未知'} · 互提 ${n.weight} 次`}</title>
                        </circle>
                        <text
                          x={x} y={round2(y - dotR - 9 * s)} textAnchor="middle"
                          className="font-ui" fontSize={fontSize} fontWeight={600}
                          fill={INK} opacity={round2(0.32 + depthK * 0.68)}
                          filter={faded ? 'url(#depthBlur)' : undefined}
                        >
                          {n.name}
                        </text>
                        {s > 1.02 && (
                          <text
                            x={x} y={round2(y + dotR + 13)} textAnchor="middle"
                            className="font-ui" fontSize={10.5} fill={INK} opacity={0.3}
                          >
                            {dynastyMap[n.name] || ''} · {n.weight} 次
                          </text>
                        )}
                      </g>
                    );
                  })}
                </>
              );
            })()}

            {/* 焦点诗人：最大的字压住中心，点在其下，像参考图里的锚词 */}
            <g className="cursor-pointer">
              <text
                x={CX} y={CY + 8} textAnchor="middle" className="font-ui"
                fontSize={focus.length > 2 ? 42 : 48} fontWeight={700} fill="#16305E"
              >
                {focus}
              </text>
              <circle cx={CX} cy={CY + 26} r={5.5} fill="#16305E" />
              <text x={CX} y={CY + 50} textAnchor="middle" className="font-ui" fontSize={11.5} fill="#16305E" opacity={0.42}>
                {dynastyMap[focus] || ''} · 关联 {focusDegree} 位诗人
              </text>
            </g>
          </svg>
        </div>

        {/* 视图控制：立体/平面切换、暂停自转 */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5">
          <button
            onClick={() => setMode((m) => (m === '3d' ? 'flat' : '3d'))}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-ui text-[11px] text-ink-mid transition-ink hover:bg-paper-dark"
            style={{ background: 'var(--inset)' }}
          >
            <Box className="h-3 w-3" /> {mode === '3d' ? '平面视图' : '立体视图'}
          </button>
          {mode === '3d' && (
            <button
              onClick={() => setSpin((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-ui text-[11px] text-ink-mid transition-ink hover:bg-paper-dark"
              style={{ background: 'var(--inset)' }}
            >
              <RotateCw className={`h-3 w-3 ${spin && !dragging ? 'anim-spin-slow' : ''}`} />
              {spin ? '暂停自转' : '继续自转'}
            </button>
          )}
        </div>
        {neighbors.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 font-ui text-sm text-ink-soft">
            <span>「{focus}」暂无小传互提数据</span>
            <Link href={`/workbench/explore?q=${encodeURIComponent(focus)}`} className="underline underline-offset-4 transition-ink hover:text-ink-deep">
              查看其诗篇 →
            </Link>
          </div>
        )}
      </div>

      <p className="!mt-2 px-1 font-ui text-[11px] text-ink-soft">
        字号与浓淡 = 远近（近处更大更深，远景轻微失焦），线越粗互提越多；
        {focusDegree > neighbors.length
          ? ` 当前仅绘制互提最强的 ${neighbors.length} 位（共 ${focusDegree} 位关联），其余可通过搜索定位`
          : ` 已绘制「${focus}」的全部 ${neighbors.length} 位关联诗人`}
      </p>

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
          <h2 className="mb-1 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <Network className="h-4 w-4 text-muted-blue" /> 关联最广的诗人
          </h2>
          <p className="mb-3 font-ui text-[11px] text-ink-soft">按小传互提度排序，优先展示库内已有作品（≥20 首）的诗人</p>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
            {topPoets.map(([name, deg]) => {
              const c = colorOf(dynastyMap[name]);
              const active = focus === name;
              return (
                <button
                  key={name}
                  onClick={() => goTo(name)}
                  className="rounded-lg p-3 text-center transition-ink hover:-translate-y-0.5"
                  style={active ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' } : { background: 'var(--inset)' }}
                >
                  <span className="font-brush text-2xl" style={active ? {} : { color: c }}>{name}</span>
                  <p className={`mt-0.5 font-ui text-xs ${active ? '' : 'text-ink-soft'}`} style={active ? { color: 'var(--btn-text)', opacity: 0.75 } : {}}>
                    {dynastyMap[name] || ''} · {deg} 关联
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-ui text-[15px] font-medium text-ink-deep">
            「{focus}」的关系解读
            <span className="ml-2 font-ui text-[11px] font-normal text-ink-soft">证据摘自诗人小传原文</span>
          </h2>
          {neighbors.slice(0, 4).map((n) => {
            const c = colorOf(dynastyMap[n.name]);
            const quotes = evidence[n.name] || [];
            return (
              <div key={n.name} className="paper-card p-4" style={{ borderLeft: `3px solid ${c}` }}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-ui text-sm font-medium" style={{ color: c }}>
                    {focus} ↔ {n.name}
                  </div>
                  <span className="shrink-0 font-ui text-[11px] text-ink-soft">互提 {n.weight} 次</span>
                </div>
                {evLoading && quotes.length === 0 ? (
                  <p className="mt-1 font-ui text-sm text-ink-soft">检索小传原文…</p>
                ) : quotes.length > 0 ? (
                  <div className="mt-1 space-y-1">
                    {quotes.map((s, i) => (
                      <p key={i} className="line-clamp-3 font-ui text-sm leading-relaxed text-ink-mid">「{s}」</p>
                    ))}
                    <p className="font-ui text-[11px] text-ink-soft">——《{n.name}小传》/《{focus}小传》原文</p>
                  </div>
                ) : (
                  <p className="mt-1 font-ui text-sm leading-relaxed text-ink-soft">
                    双方小传中未见直接互提记载，此关联来自同一小传文本内的姓名共现。
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 图谱问答（GraphRAG）：随焦点切换上下文 */}
      <GraphQaPanel kind="poet" focus={focus} />
    </div>
  );
}
