import { Prisma } from '@prisma/client';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getQueryCloud } from '@/lib/queryCloud';
import { CountUp } from '@/components/count-up';
import { StatsTrend } from '@/components/workbench/stats-trend';

export const dynamic = 'force-dynamic';

const DYN_COLORS: Record<string, string> = {
  先秦: '#8B7355', 秦: '#8B7355', 汉: '#9B8E7E', 魏晋: '#9C9487', 南北朝: '#9C9487',
  隋: '#A67C7C', 唐: '#C4A965', 五代: '#A67C7C', 宋: '#7B8EA1',
  元: '#8B7355', 明: '#6B8E7B', 清: '#9C9487',
};
const CLOUD_COLORS = ['#6B8E7B', '#7B8EA1', '#A67C7C', '#C4A965', '#8B7355', '#5D5853'];

function dynColor(d: string): string {
  for (const k of Object.keys(DYN_COLORS)) if (d.includes(k)) return DYN_COLORS[k];
  return '#9B8E7E';
}

export default async function StatsPage() {
  // 今日 / 本周 / 上周的时间边界（用于给检索次数加上时间语境）
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 864e5);
  const prevWeekStart = new Date(now.getTime() - 14 * 864e5);

  // 检索次数只统计用户真实提问，排除 RAG 评测写入的 eval: 记录
  const humanLog: Prisma.AnnotationLogWhereInput = {
    OR: [{ userQuery: null }, { NOT: { userQuery: { startsWith: 'eval:' } } }],
  };

  const [
    poemCount, poetCount, edgeCount, imageryCount, tagCount, logCount, creationCount, favCount,
    poemDyn, poetDyn, cloud, logRows, queryCloud,
    topPoets, cooc, todayCount, weekCount, prevWeekCount, annotatedRaw,
  ] = await Promise.all([
    prisma.poem.count(),
    prisma.poetBio.count(),
    prisma.poetRelation.count(),
    prisma.imagery.count(),
    prisma.poemImagery.count(),
    prisma.annotationLog.count({ where: humanLog }),
    prisma.creation.count(),
    prisma.favorite.count(),
    prisma.poem.groupBy({ by: ['dynasty'], _count: true, orderBy: { _count: { dynasty: 'desc' } } }),
    prisma.poetBio.groupBy({ by: ['dynasty'], _count: true, orderBy: { _count: { dynasty: 'desc' } } }),
    prisma.imagery.findMany({ orderBy: { count: 'desc' }, take: 50 }),
    prisma.$queryRaw<{ d: string; c: bigint }[]>`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS c
      FROM annotation_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND (user_query IS NULL OR user_query NOT LIKE 'eval:%')
      GROUP BY d ORDER BY d`,
    getQueryCloud(60),
    // 存诗最多的诗人（叙事锚点：整屏此前没有一个「人」）
    prisma.poem.groupBy({
      by: ['author'],
      where: { author: { not: '' } },
      _count: true,
      orderBy: { _count: { author: 'desc' } },
      take: 10,
    }),
    // 意象共现 Top 10（imagery_cooccurrence 由标注脚本生成，意象页取 200 条做图谱）
    prisma.imageryCooccurrence.findMany({ orderBy: { weight: 'desc' }, take: 10 }),
    prisma.annotationLog.count({ where: { createdAt: { gte: todayStart }, ...humanLog } }),
    prisma.annotationLog.count({ where: { createdAt: { gte: weekStart }, ...humanLog } }),
    prisma.annotationLog.count({ where: { createdAt: { gte: prevWeekStart, lt: weekStart }, ...humanLog } }),
    // 意象标注覆盖率：distinct 诗篇数（不是标注行数）
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT poem_id) AS n FROM poem_imagery`,
  ]);

  // 近 30 天检索序列（无数据的天补 0），交给客户端切 7/14/30 天
  const byDay = new Map(logRows.map((r) => [r.d, Number(r.c)]));
  const days: { label: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    days.push({ label: `${dt.getMonth() + 1}/${dt.getDate()}`, count: byDay.get(key) || 0 });
  }

  // 归一化朝代分布（_count 为联合类型，统一转为数字）
  const poemDynRows = poemDyn.map((p) => ({ dynasty: p.dynasty || '未知', count: Number(p._count) }));
  const poetDynRows = poetDyn.map((p) => ({ dynasty: p.dynasty || '未知', count: Number(p._count) }));
  const poetDynMap = new Map(poetDynRows.map((p) => [p.dynasty, p.count]));
  const poemMax = Math.max(...poemDynRows.map((p) => p.count), 1);
  const poetMax = Math.max(...poetDynRows.map((p) => p.count), 1);
  const topImagery = cloud.slice(0, 10);
  const topImageryMax = topImagery[0]?.count || 1;
  const queryMax = queryCloud.words[0]?.count || 1;

  const topDyn = poemDynRows[0];
  const topDynPct = topDyn ? (topDyn.count / poemCount) * 100 : 0;
  const topImageryChar = topImagery[0]?.char ?? '—';

  // 意象 × 朝代交叉矩阵（数据现成：poem_imagery 关联 poems.dynasty），取篇数最多的 6 个朝代
  const matrixDyn = poemDynRows.slice(0, 6);
  const matrixChars = topImagery.slice(0, 10).map((im) => im.char);
  const matrixRows = matrixChars.length
    ? await prisma.$queryRaw<{ d: string; c: string; n: bigint }[]>`
        SELECT p.dynasty AS d, pi.imagery_char AS c, COUNT(*) AS n
        FROM poem_imagery pi
        JOIN poems p ON p.id = pi.poem_id
        WHERE pi.imagery_char IN (${Prisma.join(matrixChars)})
        GROUP BY p.dynasty, pi.imagery_char`
    : [];
  const matrixMap = new Map(matrixRows.filter((r) => matrixDyn.some((m) => m.dynasty === r.d))
    .map((r) => [`${r.d}|${r.c}`, Number(r.n)]));
  const matrixMax = Math.max(...Array.from(matrixMap.values()), 1);

  // 诗人榜 / 共现对 / 覆盖率 / 周环比
  const poetRows = topPoets.map((p) => ({ author: p.author, count: Number(p._count) }));
  const poetTopMax = poetRows[0]?.count || 1;
  const coocMax = cooc[0]?.weight || 1;
  const annotatedPoems = Number(annotatedRaw[0]?.n ?? 0);
  const coveragePct = poemCount ? (annotatedPoems / poemCount) * 100 : 0;
  const weekDelta = prevWeekCount > 0 ? ((weekCount - prevWeekCount) / prevWeekCount) * 100 : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">数据大屏</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          全库数据规模与使用热力一览，所有数字均来自真实库表，每屏刷新即时重算
        </p>
      </div>

      {/* ===== 主视觉带：深墨底 + 巨数字，与下方浅色纸面形成密度落差 ===== */}
      <section
        className="relative overflow-hidden rounded-2xl px-7 py-8 text-[#F2EDE3] sm:px-9"
        style={{ background: 'linear-gradient(135deg,#34302A 0%,#1E1C19 58%,#2A2722 100%)' }}
      >
        {/* 细网格底纹：让深色块有"屏"的质感，而不是一块纯色 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(196,169,101,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(196,169,101,0.5) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
          }}
        />

        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
          <div className="min-w-0">
            <div className="font-ui text-[11px] tracking-[0.22em] text-[#C4A965]">DATA CANVAS · 全库一览</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-brush text-[52px] leading-none tabular-nums sm:text-[64px]">
                <CountUp value={poemCount} group duration={1800} />
              </span>
              <span className="font-ui text-sm text-[#B7AE9E]">篇</span>
            </div>
            <div className="mt-1 font-ui text-xs tracking-wide text-[#B7AE9E]">全库诗篇总量</div>
            <p className="mt-3 max-w-md font-ui text-[13px] leading-6 text-[#D8D0C2]">
              {topDyn ? `${topDyn.dynasty}代占全库 ${topDynPct.toFixed(1)}%` : '朝代分布待统计'}
              <span className="mx-2 text-[#C4A965]">·</span>
              出现最多的意象是「{topImageryChar}」，覆盖 {topImagery[0]?.count.toLocaleString() ?? 0} 首诗
            </p>
          </div>

          {/* 次级指标：等宽数字保证纵向对齐 */}
          <div className="grid grid-cols-2 gap-x-7 gap-y-4 sm:grid-cols-2">
            {[
              { v: poetCount, l: '诗人小传' },
              { v: imageryCount, l: '核心意象' },
              { v: edgeCount, l: '诗人关系边' },
              { v: logCount, l: 'AI 检索次数' },
            ].map((m) => (
              <div key={m.l}>
                <div className="font-brush text-2xl leading-none tabular-nums text-[#F2EDE3]">
                  <CountUp value={m.v} group delay={120} />
                </div>
                <div className="mt-1 font-ui text-[11px] text-[#B7AE9E]">{m.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 金色收边 + 底部次级数据条 */}
        <div
          aria-hidden="true"
          className="relative mt-7 h-px w-full"
          style={{ background: 'linear-gradient(to right, transparent, rgba(196,169,101,0.65) 18%, rgba(196,169,101,0.65) 82%, transparent)' }}
        />
        <div className="relative mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-ui text-[11px] text-[#B7AE9E]">
          <span>今日 +{todayCount.toLocaleString()} 次</span>
          <span className="text-[#5E564B]">/</span>
          <span>
            本周 {weekCount.toLocaleString()} 次
            {weekDelta !== null && (
              <span style={{ color: weekDelta >= 0 ? '#8FBFA3' : '#D2A2A2' }} className="ml-1">
                {weekDelta >= 0 ? '↑' : '↓'} {Math.abs(weekDelta).toFixed(1)}%
              </span>
            )}
            {weekDelta === null && <span className="ml-1">（上周无调用）</span>}
          </span>
          <span className="text-[#5E564B]">/</span>
          <span>意象标注 {tagCount.toLocaleString()} 行</span>
          <span className="text-[#5E564B]">/</span>
          <span>用户创作 {creationCount.toLocaleString()}</span>
          <span className="text-[#5E564B]">/</span>
          <span>诗篇收藏 {favCount.toLocaleString()}</span>
        </div>
      </section>

      {/* ===== 朝代分布（诗篇 / 诗人 双序列） | 检索热力趋势 ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="paper-card p-6">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <h2 className="font-ui text-[15px] font-medium text-ink-deep">朝代分布</h2>
            <div className="flex items-center gap-3 font-ui text-[11px] text-ink-soft">
              <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-4 rounded-full" style={{ background: '#9B8E7E' }} />诗篇</span>
              <span className="inline-flex items-center gap-1.5"><i className="inline-block h-1 w-4 rounded-full" style={{ background: '#9B8E7E', opacity: 0.45 }} />诗人</span>
            </div>
          </div>
          <div className="space-y-3.5">
            {poemDynRows.map((p) => {
              const poets = poetDynMap.get(p.dynasty) ?? 0;
              const c = dynColor(p.dynasty);
              const pct = (p.count / poemCount) * 100;
              return (
                <Link
                  key={p.dynasty}
                  href={`/workbench/explore?dynasty=${encodeURIComponent(p.dynasty)}`}
                  className="group flex items-center gap-3 rounded-md px-1 py-0.5 transition-ink hover:bg-paper-dark"
                  title={`查看${p.dynasty}代诗篇`}
                >
                  <span className="w-9 shrink-0 font-brush text-lg leading-none" style={{ color: c }}>{p.dynasty}</span>
                  <div className="min-w-0 flex-1">
                    <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--inset)' }}>
                      <div className="h-full rounded-full transition-ink" style={{ width: `${(p.count / poemMax) * 100}%`, background: c, opacity: 0.92 }} />
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: 'var(--inset)' }}>
                      <div className="h-full rounded-full transition-ink" style={{ width: `${(poets / poetMax) * 100}%`, background: c, opacity: 0.45 }} />
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right font-ui text-xs tabular-nums text-ink-mid">
                    {p.count.toLocaleString()}<span className="ml-1 text-[10px] text-ink-soft">{pct.toFixed(1)}%</span>
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="mt-4 font-ui text-[11px] text-ink-soft">
            共 {poemCount.toLocaleString()} 篇 · {poetCount.toLocaleString()} 位诗人，上条为诗篇数、下条为该朝诗人数 · 点击朝代可下钻到探索页
          </p>
        </div>

        <div className="paper-card p-6">
          <h2 className="mb-1 font-ui text-[15px] font-medium text-ink-deep">检索热力 · AI 调用趋势</h2>
          <StatsTrend data={days} logTotal={logCount} />
        </div>
      </div>

      {/* ===== 诗人榜 Top10 | 意象共现 Top10 ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="paper-card p-6">
          <h2 className="mb-1 font-ui text-[15px] font-medium text-ink-deep">存诗最多 · 诗人 Top 10</h2>
          <p className="mb-4 font-ui text-[11px] text-ink-soft">按全库收录篇数统计，点击可查看该诗人全部诗篇</p>
          <div className="space-y-3">
            {poetRows.map((p, i) => (
              <Link
                key={p.author}
                href={`/workbench/explore?q=${encodeURIComponent(p.author)}`}
                className="group flex items-center gap-3 rounded-md px-1 py-0.5 transition-ink hover:bg-paper-dark"
                title={`查看${p.author}的诗篇`}
              >
                <span className="w-4 shrink-0 font-ui text-[11px] tabular-nums text-ink-soft">{i + 1}</span>
                <span className="w-14 shrink-0 truncate font-brush text-lg leading-none text-ink-deep group-hover:text-[#8B6F3E]">{p.author}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--inset)' }}>
                  <div className="h-full rounded-full transition-ink" style={{ width: `${(p.count / poetTopMax) * 100}%`, background: '#8B7355', opacity: 0.85 }} />
                </div>
                <span className="w-20 shrink-0 text-right font-ui text-xs tabular-nums text-ink-mid">{p.count.toLocaleString()} 篇</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="paper-card p-6">
          <h2 className="mb-1 font-ui text-[15px] font-medium text-ink-deep">意象共现 · Top 10 组合</h2>
          <p className="mb-4 font-ui text-[11px] text-ink-soft">
            取自 <code className="font-ui text-[10px]">imagery_cooccurrence</code> 表，统计同首诗内两个意象出现的次数（weight）
          </p>
          <div className="space-y-3">
            {cooc.map((e, i) => (
              <div key={`${e.sourceChar}-${e.targetChar}`} className="flex items-center gap-3">
                <span className="w-4 shrink-0 font-ui text-[11px] tabular-nums text-ink-soft">{i + 1}</span>
                <span className="w-16 shrink-0 font-brush text-lg leading-none text-ink-deep">
                  {e.sourceChar}<span className="mx-1 text-ink-soft">—</span>{e.targetChar}
                </span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--inset)' }}>
                  <div className="h-full rounded-full transition-ink" style={{ width: `${(e.weight / coocMax) * 100}%`, background: '#7B8EA1', opacity: 0.85 }} />
                </div>
                <span className="w-20 shrink-0 text-right font-ui text-xs tabular-nums text-ink-mid">{e.weight.toLocaleString()} 次</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 高频意象 Top10 | 意象 × 朝代热力矩阵 ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="paper-card p-6">
          <h2 className="mb-1 font-ui text-[15px] font-medium text-ink-deep">高频意象 · Top 10</h2>
          <p className="mb-4 font-ui text-[11px] text-ink-soft">
            按出现在多少首诗统计，占全部意象标注的 {((topImagery.reduce((s, im) => s + im.count, 0) / Math.max(tagCount, 1)) * 100).toFixed(1)}%
            <span className="mx-1.5 text-ink-soft">·</span>
            已标注 {annotatedPoems.toLocaleString()} 篇，占全库 {coveragePct < 1 ? coveragePct.toFixed(2) : coveragePct.toFixed(1)}%，标注集以唐诗为主
          </p>
          <div className="space-y-3">
            {topImagery.map((im, i) => (
              <Link key={im.char} href={`/workbench/imagery?focus=${encodeURIComponent(im.char)}`} className="group flex items-center gap-3 rounded-md px-1 py-0.5 transition-ink hover:bg-paper-dark" title={`在${im.char}的意象图谱中查看`}>
                <span className="w-4 shrink-0 font-ui text-[11px] tabular-nums text-ink-soft">{i + 1}</span>
                <span className="w-7 shrink-0 font-brush text-xl leading-none" style={{ color: CLOUD_COLORS[i % CLOUD_COLORS.length] }}>{im.char}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--inset)' }}>
                  <div className="h-full rounded-full transition-ink" style={{ width: `${(im.count / topImageryMax) * 100}%`, background: CLOUD_COLORS[i % CLOUD_COLORS.length], opacity: 0.88 }} />
                </div>
                <span className="w-20 shrink-0 text-right font-ui text-xs tabular-nums text-ink-mid">{im.count.toLocaleString()} 首</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="paper-card p-6">
          <h2 className="mb-1 flex items-baseline justify-between gap-3 font-ui text-[15px] font-medium text-ink-deep">
            意象 × 朝代 · 交叉热力
            <Link href="/workbench/imagery-timeline?char=月" className="font-ui text-[11px] font-normal text-ink-mid underline underline-offset-4 transition-ink hover:text-ink-deep">
              看朝代演变 →
            </Link>
          </h2>
          <p className="mb-4 font-ui text-[11px] text-ink-soft">
            基于意象标注集（{annotatedPoems.toLocaleString()} 篇诗）统计；与「意象时空地图」的全库逐字扫描口径不同，两页数字不可直接对照
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-separate" style={{ borderSpacing: '3px' }}>
              <thead>
                <tr>
                  <th className="w-9" />
                  {matrixChars.map((c) => (
                    <th key={c} className="text-center font-brush text-sm font-normal" style={{ color: '#7B8EA1' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixDyn.map((d) => (
                  <tr key={d.dynasty}>
                    <th className="text-left font-brush text-base font-normal" style={{ color: dynColor(d.dynasty) }}>{d.dynasty}</th>
                    {matrixChars.map((c) => {
                      const n = matrixMap.get(`${d.dynasty}|${c}`) ?? 0;
                      const ratio = n / matrixMax;
                      return (
                        <td key={c} className="rounded-md text-center font-ui text-[10px] tabular-nums"
                          style={{
                            background: n ? `rgba(93,113,133,${(0.08 + ratio * 0.72).toFixed(3)})` : 'var(--inset)',
                            color: ratio > 0.55 ? '#F2EDE3' : 'var(--ink-mid)',
                            height: 26,
                          }}
                          title={`${d.dynasty} · ${c}：${n} 首`}
                        >
                          {n || '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== 用户检索词云：按频次分三档字号，避免 16→42 的连续跳变 ===== */}
      <div className="paper-card p-6">
        <h2 className="mb-1 font-ui text-[15px] font-medium text-ink-deep">用户都在问什么 · 检索词云</h2>
        <p className="mb-4 font-ui text-xs text-ink-soft">
          来自最近 {queryCloud.total.toLocaleString()} 条真实检索提问的高频词 · 字号按频次分三档
        </p>
        {queryCloud.words.length === 0 ? (
          <p className="py-8 text-center font-ui text-sm text-ink-soft">暂无足够检索记录，使用 AI 注解后即可生成词云</p>
        ) : (
          <div className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-3 py-4">
            {queryCloud.words.map((w, i) => {
              const ratio = w.count / queryMax;
              const size = ratio >= 0.6 ? 34 : ratio >= 0.3 ? 25 : 18;
              return (
                <span
                  key={w.text}
                  className="cursor-default font-brush leading-none transition-ink hover:scale-110"
                  style={{
                    fontSize: size,
                    color: CLOUD_COLORS[i % CLOUD_COLORS.length],
                    opacity: ratio >= 0.3 ? 0.95 : 0.72,
                  }}
                  title={`被问及 ${w.count} 次`}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
