import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Sparkles, BookOpen, Edit, Star } from 'lucide-react';

export const dynamic = 'force-dynamic';

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export default async function DashboardPage() {
  const session = await auth();
  const uid = session!.user.id!;
  const name = session!.user.name || '诗词探索者';

  const [favCount, creationCount, annotateCount, histories, readPoems, recommend, imageryTop, agentLogs] =
    await Promise.all([
      prisma.favorite.count({ where: { userId: uid } }),
      prisma.creation.count({ where: { userId: uid } }),
      prisma.history.count({ where: { userId: uid, actionType: 'annotate' } }),
      prisma.history.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.history.findMany({
        where: { userId: uid, targetId: { not: null } },
        distinct: ['targetId'],
        select: { targetId: true },
      }),
      prisma.poem.findFirst({
        where: { annotations: { isNot: null }, tags: { not: '[]' } },
        select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true },
        skip: Math.floor(Math.random() * 300),
      }),
      prisma.imagery.findMany({ orderBy: { count: 'desc' }, take: 6 }),
      prisma.annotationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 4 }),
    ]);

  const recommendLines = (recommend?.paragraphsSimp as string[] | null)?.slice(0, 2) || [];
  const recent = histories.slice(0, 4);
  const readCount = readPoems.length;
  const previewAnnotation = await prisma.poem.findFirst({
    where: { annotations: { isNot: null } },
    select: {
      id: true, title: true, author: true, dynasty: true, paragraphsSimp: true,
      annotations: { select: { fanyi: true } },
    },
  });

  return (
    <div className="space-y-6">
      {/* 欢迎卡片 */}
      <section className="relative overflow-hidden rounded-xl p-6 md:p-8" style={{ background: 'linear-gradient(120deg,#3A3835 0%,#5D5853 60%,#7B8EA1 130%)' }}>
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full opacity-25" style={{ background: 'radial-gradient(circle,#C4A965,transparent 70%)' }} />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-brush text-3xl text-paper-light md:text-4xl">{greeting()}，{name}</h1>
            <p className="mt-2 font-ui text-sm" style={{ color: 'rgba(245,242,236,0.75)' }}>
              最近活动 {recent.length} 项 · AI注解 {annotateCount} 条 · 创作 {creationCount} 首
            </p>
            {recommend && (
              <div className="mt-4 inline-flex max-w-xl items-start gap-3 rounded-lg px-4 py-3" style={{ background: 'rgba(245,242,236,0.12)' }}>
                <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-ui text-[10px]" style={{ background: 'rgba(196,169,101,0.3)', color: '#F5F2EC' }}>今日推荐</span>
                <div>
                  <p className="font-serif text-sm leading-relaxed text-paper-light">
                    {recommendLines.join(' ')}
                  </p>
                  <p className="mt-1 font-ui text-xs" style={{ color: 'rgba(245,242,236,0.6)' }}>
                    〔{recommend.dynasty}〕{recommend.author}《{recommend.title}》
                  </p>
                </div>
              </div>
            )}
          </div>
          <Link href="/workbench/annotate" className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg px-5 py-3 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5" style={{ background: 'var(--inset)', color: 'var(--ink-deep)' }}>
            <Sparkles className="h-4 w-4" /> 开始AI注解
          </Link>
        </div>
      </section>

      {/* 统计卡片 */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icon: <BookOpen className="h-5 w-5" />, label: '研习诗词', value: `${readCount}`, trend: readCount ? '注解 · 收藏' : '开始探索', c: '#7B8EA1' },
          { icon: <Sparkles className="h-5 w-5" />, label: 'AI注解', value: `${annotateCount}`, trend: annotateCount ? '持续生成中' : '开始体验', c: '#6B8E7B' },
          { icon: <Edit className="h-5 w-5" />, label: '风格创作', value: `${creationCount}`, trend: creationCount ? '灵感迸发' : '去创作一首', c: '#8B7355' },
          { icon: <Star className="h-5 w-5" />, label: '我的收藏', value: `${favCount}`, trend: favCount ? '书藏万卷' : '发现美诗', c: '#A67C7C' },
        ].map((s) => (
          <div key={s.label} className="paper-card paper-card-hover p-5">
            <div className="flex items-center justify-between">
              <span className="rounded-lg p-2" style={{ background: `${s.c}1f`, color: s.c }}>{s.icon}</span>
              <span className="font-ui text-xs text-ink-soft">{s.trend}</span>
            </div>
            <div className="mt-3 font-brush text-[32px] leading-none text-ink-deep">{s.value}</div>
            <div className="mt-1.5 font-ui text-xs text-ink-soft">{s.label}</div>
          </div>
        ))}
      </section>

      {/* AI注解预览 + 最近浏览 */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {previewAnnotation && (
          <div className="paper-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-ui text-[15px] font-medium text-ink-deep">AI注解 · 最近</h2>
              <Link href="/workbench/annotate" className="font-ui text-xs text-muted-blue transition-ink hover:underline">查看全部 →</Link>
            </div>
            <div className="mb-4 rounded-lg p-4 text-center" style={{ background: 'var(--inset)' }}>
              <p className="font-brush text-xl text-ink-deep">{previewAnnotation.title}</p>
              <p className="mt-0.5 font-ui text-xs text-ink-soft">〔{previewAnnotation.dynasty}〕{previewAnnotation.author}</p>
              <p className="mt-2 font-serif text-sm leading-loose text-ink-mid">
                {((previewAnnotation.paragraphsSimp as string[] | null) || []).slice(0, 2).join(' ')}
              </p>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg p-3.5" style={{ borderLeft: '3px solid #8B7355', background: 'var(--inset)' }}>
                <div className="mb-1 flex items-center gap-1.5 font-ui text-xs font-medium text-ink-deep">
                  <Sparkles className="h-3.5 w-3.5 text-sepia" /> 字词释义
                </div>
                <p className="line-clamp-2 font-ui text-sm leading-relaxed text-ink-mid">
                  {(previewAnnotation.annotations?.fanyi || '暂无注解').slice(0, 80)}…
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-ui text-xs" style={{ border: '1px dashed #7B8EA1', color: '#7B8EA1', background: 'rgba(123,142,161,0.06)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                知识库 · 意象检索
              </div>
            </div>
          </div>
        )}

        <div className="paper-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-ui text-[15px] font-medium text-ink-deep">最近浏览</h2>
            <Link href="/workbench/explore" className="font-ui text-xs text-muted-blue transition-ink hover:underline">去探索 →</Link>
          </div>
          {recent.length === 0 && (
            <p className="py-8 text-center font-ui text-sm text-ink-soft">还没有浏览记录，去诗词探索页看看吧</p>
          )}
          <div className="space-y-1">
            {recent.map((h) => (
              <div key={h.id.toString()} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-ink hover:bg-paper-dark/60">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: '#7B8EA1' }} />
                <span className="flex-1 truncate font-ui text-sm text-ink-mid">{h.title}</span>
                <span className="font-ui text-xs text-ink-soft">
                  {h.createdAt.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 意象快捷入口 + 注解记录 */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="paper-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-ui text-[15px] font-medium text-ink-deep">意象快捷入口</h2>
            <Link href="/workbench/imagery" className="font-ui text-xs text-muted-blue transition-ink hover:underline">完整图谱 →</Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {imageryTop.map((im) => (
              <Link key={im.char} href={`/workbench/imagery?focus=${encodeURIComponent(im.char)}`} className="rounded-lg p-4 text-center transition-ink hover:-translate-y-0.5" style={{ background: 'var(--inset)' }}>
                <span className="font-brush text-2xl text-ink-deep">{im.char}</span>
                <p className="mt-1 font-ui text-xs text-ink-soft">{im.count} 首</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="paper-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-ui text-[15px] font-medium text-ink-deep">AI 注解记录</h2>
            <span className="inline-flex items-center gap-1.5 font-ui text-xs" style={{ color: '#6B8E7B' }}>
              <span className="pulse-dot" /> 运行正常
            </span>
          </div>
          {agentLogs.length === 0 && (
            <p className="py-8 text-center font-ui text-sm text-ink-soft">还没有注解记录，生成一条 AI 注解试试</p>
          )}
          <div className="relative space-y-4 pl-5">
            <span className="absolute left-[6px] top-1 h-[calc(100%-8px)] w-px" style={{ background: 'var(--border-light)' }} />
            {agentLogs.map((l) => (
              <div key={l.id.toString()} className="relative">
                <span className="absolute -left-5 top-1 h-3 w-3 rounded-full border-2 border-paper-light" style={{ background: '#6B8E7B' }} />
                <div className="font-ui text-sm text-ink-deep">{l.userQuery || 'AI注解'}</div>
                <p className="mt-0.5 font-ui text-xs text-ink-soft">
                  glm-4-flash · 知识库检索 {(l.retrievedChunks as string[] | null)?.length ?? 0} 篇 · {l.latencyMs ?? 0}ms
                </p>
                <p className="mt-0.5 font-ui text-xs text-ink-soft">
                  {l.createdAt.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
