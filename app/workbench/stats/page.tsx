import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DYN_COLORS: Record<string, string> = {
  唐: '#C4A965', 宋: '#7B8EA1', 五代: '#A67C7C', 元: '#8B7355', 明: '#6B8E7B', 清: '#9C9487',
};
const CLOUD_COLORS = ['#6B8E7B', '#7B8EA1', '#A67C7C', '#C4A965', '#8B7355', '#5D5853'];

function dynColor(d: string): string {
  for (const k of Object.keys(DYN_COLORS)) if (d.includes(k)) return DYN_COLORS[k];
  return '#9B8E7E';
}

export default async function StatsPage() {
  const [
    poemCount, poetCount, edgeCount, imageryCount, tagCount, logCount, creationCount, favCount,
    poemDyn, poetDyn, cloud, logRows,
  ] = await Promise.all([
    prisma.poem.count(),
    prisma.poetBio.count(),
    prisma.poetRelation.count(),
    prisma.imagery.count(),
    prisma.poemImagery.count(),
    prisma.annotationLog.count(),
    prisma.creation.count(),
    prisma.favorite.count(),
    prisma.poem.groupBy({ by: ['dynasty'], _count: true, orderBy: { _count: { dynasty: 'desc' } } }),
    prisma.poetBio.groupBy({ by: ['dynasty'], _count: true, orderBy: { _count: { dynasty: 'desc' } } }),
    prisma.imagery.findMany({ orderBy: { count: 'desc' }, take: 50 }),
    prisma.$queryRaw<{ d: string; c: bigint }[]>`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS c
      FROM annotation_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      GROUP BY d ORDER BY d`,
  ]);

  // 近 14 天检索热力序列（无数据的天补 0）
  const byDay = new Map(logRows.map((r) => [r.d, Number(r.c)]));
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    days.push({ label: `${dt.getMonth() + 1}/${dt.getDate()}`, count: byDay.get(key) || 0 });
  }
  const maxDay = Math.max(...days.map((d) => d.count), 1);
  const activeDays = days.filter((d) => d.count > 0).length;

  // 归一化朝代分布（_count 为联合类型，统一转为数字）
  const poemDynRows = poemDyn.map((p) => ({ dynasty: p.dynasty || '未知', count: Number(p._count) }));
  const poetDynRows = poetDyn.map((p) => ({ dynasty: p.dynasty || '未知', count: Number(p._count) }));
  const poemMax = Math.max(...poemDynRows.map((p) => p.count), 1);
  const poetMax = Math.max(...poetDynRows.map((p) => p.count), 1);
  const cloudMax = cloud[0]?.count || 1;
  const topImagery = cloud.slice(0, 10);
  const topImageryMax = topImagery[0]?.count || 1;

  const stats = [
    { num: poemCount.toLocaleString(), label: '诗篇总量' },
    { num: poetCount.toLocaleString(), label: '诗人小传' },
    { num: edgeCount.toLocaleString(), label: '诗人关系边' },
    { num: tagCount.toLocaleString(), label: '意象标注' },
    { num: imageryCount.toLocaleString(), label: '核心意象' },
    { num: logCount.toLocaleString(), label: 'AI 检索次数' },
    { num: creationCount.toLocaleString(), label: '用户创作' },
    { num: favCount.toLocaleString(), label: '诗篇收藏' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">数据大屏</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          全库数据规模与使用热力一览：{poemCount.toLocaleString()} 篇诗篇、{poetCount.toLocaleString()} 位诗人、{imageryCount} 个核心意象，支撑检索、注解与图谱问答
        </p>
      </div>

      {/* 规模统计 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="paper-card p-5 text-center">
            <div className="font-brush text-3xl text-ink-deep">{s.num}</div>
            <div className="mt-1 font-ui text-xs text-ink-soft">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 朝代分布 */}
        <div className="paper-card p-6">
          <h2 className="mb-5 font-ui text-[15px] font-medium text-ink-deep">朝代分布</h2>
          <div className="space-y-5">
            <div>
              <p className="mb-2.5 font-ui text-xs text-ink-soft">诗篇 · 共 {poemCount.toLocaleString()} 篇</p>
              {poemDynRows.map((p) => (
                <div key={`p${p.dynasty}`} className="mb-2.5 flex items-center gap-3">
                  <span className="w-10 shrink-0 font-brush text-lg" style={{ color: dynColor(p.dynasty) }}>{p.dynasty}</span>
                  <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--inset)' }}>
                    <div className="h-full rounded-full transition-ink" style={{ width: `${(p.count / poemMax) * 100}%`, background: dynColor(p.dynasty), opacity: 0.85 }} />
                  </div>
                  <span className="w-14 shrink-0 text-right font-ui text-xs text-ink-mid">{p.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2.5 font-ui text-xs text-ink-soft">诗人 · 共 {poetCount.toLocaleString()} 位</p>
              {poetDynRows.map((p) => (
                <div key={`b${p.dynasty}`} className="mb-2.5 flex items-center gap-3">
                  <span className="w-10 shrink-0 font-brush text-lg" style={{ color: dynColor(p.dynasty) }}>{p.dynasty}</span>
                  <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--inset)' }}>
                    <div className="h-full rounded-full transition-ink" style={{ width: `${(p.count / poetMax) * 100}%`, background: dynColor(p.dynasty), opacity: 0.85 }} />
                  </div>
                  <span className="w-14 shrink-0 text-right font-ui text-xs text-ink-mid">{p.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 检索热力 */}
        <div className="paper-card p-6">
          <h2 className="mb-1 font-ui text-[15px] font-medium text-ink-deep">检索热力 · 近 14 天</h2>
          <p className="mb-5 font-ui text-xs text-ink-soft">AI 注解与追问请求次数 · 累计 {logCount.toLocaleString()} 次 · {activeDays}/14 天有调用</p>
          <div className="flex h-40 items-end gap-1.5">
            {days.map((d) => (
              <div key={d.label} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${d.label}：${d.count} 次`}>
                <span className="font-ui text-[10px] text-ink-soft">{d.count || ''}</span>
                <div
                  className="w-full rounded-t-md transition-ink"
                  style={{
                    height: `${Math.max((d.count / maxDay) * 100, 2)}%`,
                    background: d.count ? 'linear-gradient(180deg,#7B8EA1,#A8B8C6)' : 'var(--inset)',
                  }}
                />
                <span className="font-ui text-[10px] text-ink-soft">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 意象词云 */}
        <div className="paper-card p-6">
          <h2 className="mb-4 font-ui text-[15px] font-medium text-ink-deep">意象词云 · Top 50</h2>
          <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 py-3">
            {cloud.map((im, i) => {
              const ratio = im.count / cloudMax;
              return (
                <span
                  key={im.char}
                  className="cursor-default font-brush leading-none transition-ink hover:scale-110"
                  style={{
                    fontSize: Math.round(18 + ratio * 26),
                    color: CLOUD_COLORS[i % CLOUD_COLORS.length],
                    opacity: 0.7 + ratio * 0.3,
                  }}
                  title={`「${im.char}」出现在 ${im.count.toLocaleString()} 首诗中`}
                >
                  {im.char}
                </span>
              );
            })}
          </div>
        </div>

        {/* 意象 Top 10 */}
        <div className="paper-card p-6">
          <h2 className="mb-5 font-ui text-[15px] font-medium text-ink-deep">高频意象 · Top 10</h2>
          <div className="space-y-3">
            {topImagery.map((im, i) => (
              <div key={im.char} className="flex items-center gap-3">
                <span className="w-4 shrink-0 font-ui text-xs text-ink-soft">{i + 1}</span>
                <span className="w-6 shrink-0 font-brush text-xl" style={{ color: CLOUD_COLORS[i % CLOUD_COLORS.length] }}>{im.char}</span>
                <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--inset)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(im.count / topImageryMax) * 100}%`, background: CLOUD_COLORS[i % CLOUD_COLORS.length], opacity: 0.85 }} />
                </div>
                <span className="w-16 shrink-0 text-right font-ui text-xs text-ink-mid">{im.count.toLocaleString()} 首</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
