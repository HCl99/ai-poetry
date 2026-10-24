import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { dayIndexOf } from '@/lib/daily';
import { Sparkles, BookOpen, Edit, Star, Route, Flag } from 'lucide-react';
import { HeroCarousel } from '@/components/workbench/hero-carousel';

export const dynamic = 'force-dynamic';

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/**
 * 注解/问答日志的 userQuery 以英文前缀区分来源（assistant:/followup:/annotate:/compare:/eval:），
 * 面向用户展示时统一中文化，避免界面出现英文；兼容早期已入库的日志。
 */
function prettyQuery(raw: string | null): string {
  if (!raw) return 'AI 注解';
  const i = raw.indexOf(':');
  const kind = i > 0 ? raw.slice(0, i) : '';
  const rest = i > 0 ? raw.slice(i + 1) : raw;
  switch (kind) {
    case 'assistant':
      return `AI 助手 · ${rest}`;
    case 'followup': {
      const j = rest.indexOf(':');
      return j > 0 ? `追问《${rest.slice(0, j)}》· ${rest.slice(j + 1)}` : `追问 · ${rest}`;
    }
    case 'annotate':
      return `AI 注解 · 《${rest}》`;
    case 'compare': {
      const j = rest.indexOf(':');
      return j > 0 ? `多模型对比 · 《${rest.slice(0, j)}》· ${rest.slice(j + 1)}` : `多模型对比 · ${rest}`;
    }
    case 'eval':
      return `RAG 评测 · 《${rest}》`;
    default:
      return raw;
  }
}

/** 语义色轻着色 / 明暗主题下可读的同色系文字（与 --ink-deep 混合，暗色自动提亮） */
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
const readable = (c: string) => `color-mix(in srgb, ${c} 70%, var(--ink-deep))`;

export default async function DashboardPage() {
  const session = await auth();
  const uid = session!.user.id!;
  const name = session!.user.name || '诗词探索者';

  const [favCount, creationCount, annotateCount, histories, readPoems, annotateDistinctList, dailyCount, imageryTop, agentLogs] =
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
      prisma.history.findMany({
        where: { userId: uid, actionType: 'annotate', targetId: { not: null } },
        distinct: ['targetId'],
        select: { targetId: true },
      }),
      prisma.poem.count({ where: { annotations: { isNot: null }, tags: { not: '[]' } } }),
      prisma.imagery.findMany({ orderBy: { count: 'desc' }, take: 6 }),
      prisma.annotationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 4 }),
    ]);

  // 每日一诗：当日全站固定；学习路径：推荐一首用户未读过的经典
  const dailyPoem = dailyCount
    ? await prisma.poem.findFirst({
        where: { annotations: { isNot: null }, tags: { not: '[]' } },
        select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true },
        skip: dayIndexOf(dailyCount),
      })
    : null;
  const readIds = readPoems.map((r) => r.targetId!).filter(Boolean);
  const nextPoem = await prisma.poem.findFirst({
    where: { tags: { not: '[]' }, id: { notIn: readIds } },
    select: { id: true, title: true, author: true, dynasty: true },
  });

  const dailyLines = (dailyPoem?.paragraphsSimp as string[] | null)?.slice(0, 2) || [];
  const recent = histories.slice(0, 4);
  const readCount = readIds.length;
  const annotateDistinct = annotateDistinctList.length;
  const previewAnnotation = await prisma.poem.findFirst({
    where: { annotations: { isNot: null } },
    select: {
      id: true, title: true, author: true, dynasty: true, paragraphsSimp: true,
      annotations: { select: { fanyi: true } },
    },
  });

  return (
    <div className="space-y-6">
      {/* 欢迎卡片：水墨场景轮播，每张背景对应一句贴合系统的话（v2.2 动态化） */}
      <HeroCarousel>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-brush text-3xl text-on-image md:text-4xl">{greeting()}，{name}</h1>
            <p className="mt-2 font-ui text-sm" style={{ color: 'color-mix(in srgb, var(--on-image) 75%, transparent)' }}>
              最近活动 {recent.length} 项 · AI注解 {annotateCount} 条 · 创作 {creationCount} 首
            </p>
            {dailyPoem && (
              <div className="mt-4 inline-flex max-w-xl items-start gap-3 rounded-lg px-4 py-3" style={{ background: 'color-mix(in srgb, var(--on-image) 12%, transparent)' }}>
                <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-ui text-[10px]" style={{ background: 'color-mix(in srgb, var(--gold-wash) 30%, transparent)', color: 'var(--on-image)' }}>每日一诗</span>
                <div>
                  <p className="font-serif text-sm leading-relaxed text-on-image">
                    {dailyLines.join(' ')}
                  </p>
                  <p className="mt-1 font-ui text-xs" style={{ color: 'color-mix(in srgb, var(--on-image) 60%, transparent)' }}>
                    〔{dailyPoem.dynasty}〕{dailyPoem.author}《{dailyPoem.title}》 · 按日期轮换，当日全站同一首
                  </p>
                </div>
              </div>
            )}
          </div>
          <Link href="/workbench/annotate" className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg px-5 py-3 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5" style={{ background: 'var(--inset)', color: 'var(--ink-deep)' }}>
            <Sparkles className="h-4 w-4" /> 开始AI注解
          </Link>
        </div>
      </HeroCarousel>

      {/* 统计卡片（进场递增浮现） */}
      <section className="anim-fade-up grid grid-cols-2 gap-4 lg:grid-cols-4" style={{ animationDelay: '0.08s' }}>
        {[
          { icon: <BookOpen className="h-5 w-5" />, label: '研习诗词', value: `${readCount}`, trend: readCount ? '注解 · 收藏' : '开始探索', c: 'var(--muted-blue)' },
          { icon: <Sparkles className="h-5 w-5" />, label: 'AI注解', value: `${annotateCount}`, trend: annotateCount ? '持续生成中' : '开始体验', c: 'var(--sage)' },
          { icon: <Edit className="h-5 w-5" />, label: '风格创作', value: `${creationCount}`, trend: creationCount ? '灵感迸发' : '去创作一首', c: 'var(--sepia)' },
          { icon: <Star className="h-5 w-5" />, label: '我的收藏', value: `${favCount}`, trend: favCount ? '书藏万卷' : '发现美诗', c: 'var(--rose)' },
        ].map((s) => (
          <div key={s.label} className="paper-card paper-card-hover p-5">
            <div className="flex items-center justify-between">
              <span className="rounded-lg p-2" style={{ background: tint(s.c, 12), color: readable(s.c) }}>{s.icon}</span>
              <span className="font-ui text-xs text-ink-soft">{s.trend}</span>
            </div>
            <div className="mt-3 font-brush text-[32px] leading-none text-ink-deep">{s.value}</div>
            <div className="mt-1.5 font-ui text-xs text-ink-soft">{s.label}</div>
          </div>
        ))}
      </section>

      {/* 学习路径：三阶段真实进度 + 下一首推荐 */}
      <section className="anim-fade-up paper-card p-6" style={{ animationDelay: '0.16s' }}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <Route className="h-4 w-4 text-muted-blue" /> 我的学习路径
          </h2>
          <span className="font-ui text-xs text-ink-soft">进度来自你的真实学习数据</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: '启蒙诵读', desc: '背诵闯关 · 研习 10 首经典', done: Math.min(readCount, 10), total: 10, c: 'var(--muted-blue)', href: '/workbench/recite' },
            { label: 'AI 精读', desc: '完成 5 首 AI 深度注解', done: Math.min(annotateDistinct, 5), total: 5, c: 'var(--sage)', href: '/workbench/annotate' },
            { label: '提笔创作', desc: '完成 3 首风格迁移创作', done: Math.min(creationCount, 3), total: 3, c: 'var(--rose)', href: '/workbench/transfer' },
          ].map((s, i) => {
            const pct = Math.round((s.done / s.total) * 100);
            const status = pct >= 100 ? '已达成' : s.done > 0 ? '进行中' : '待开始';
            return (
              <Link key={s.label} href={s.href} className="rounded-lg p-4 transition-ink hover:-translate-y-0.5" style={{ background: 'var(--inset)' }}>
                <div className="flex items-center justify-between">
                  <span className="font-ui text-sm font-medium" style={{ color: readable(s.c) }}>第{'一二三'[i]}步 · {s.label}</span>
                  <span className="rounded-full px-2 py-0.5 font-ui text-[10px]" style={{ background: tint(s.c, 12), color: readable(s.c) }}>{status}</span>
                </div>
                <p className="mt-1.5 font-ui text-xs text-ink-soft">{s.desc}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--paper-dark)' }}>
                  <div className="h-full rounded-full transition-ink" style={{ width: `${pct}%`, background: s.c }} />
                </div>
                <p className="mt-2 font-ui text-xs text-ink-soft">{s.done} / {s.total}{pct >= 100 ? ' · 已达成' : ''}</p>
              </Link>
            );
          })}
        </div>
        {nextPoem && (
          <div className="mt-5 flex flex-col gap-3 rounded-lg p-4 md:flex-row md:items-center md:justify-between" style={{ border: '1px dashed var(--border-c)', background: 'var(--paper-dark)' }}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-md px-2 py-1 font-ui text-[10px]" style={{ background: 'color-mix(in srgb, var(--gold-wash) 20%, transparent)', color: readable('var(--sepia)') }}>下一首推荐</span>
              <span className="font-serif text-sm text-ink-deep">《{nextPoem.title}》</span>
              <span className="font-ui text-xs text-ink-soft">〔{nextPoem.dynasty}〕{nextPoem.author} · 你还未读过</span>
            </div>
            <Link href={`/workbench/annotate?poem=${nextPoem.id}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 font-ui text-xs font-medium transition-ink hover:-translate-y-0.5" style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}>
              <Flag className="h-3.5 w-3.5" /> 开始学习
            </Link>
          </div>
        )}
      </section>

      {/* AI注解预览 + 最近浏览 */}
      <section className="anim-fade-up grid grid-cols-1 gap-6 lg:grid-cols-2" style={{ animationDelay: '0.24s' }}>
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
              <div className="rounded-lg p-3.5" style={{ borderLeft: '3px solid var(--sepia)', background: 'var(--inset)' }}>
                <div className="mb-1 flex items-center gap-1.5 font-ui text-xs font-medium text-ink-deep">
                  <Sparkles className="h-3.5 w-3.5 text-sepia" /> 字词释义
                </div>
                <p className="line-clamp-2 font-ui text-sm leading-relaxed text-ink-mid">
                  {(previewAnnotation.annotations?.fanyi || '暂无注解').slice(0, 80)}…
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-ui text-xs" style={{ border: '1px dashed var(--muted-blue)', color: readable('var(--muted-blue)'), background: tint('var(--muted-blue)', 6) }}>
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
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--muted-blue)' }} />
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
      <section className="anim-fade-up grid grid-cols-1 gap-6 lg:grid-cols-2" style={{ animationDelay: '0.32s' }}>
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
            <span className="inline-flex items-center gap-1.5 font-ui text-xs" style={{ color: readable('var(--sage)') }}>
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
                <span className="absolute -left-5 top-1 h-3 w-3 rounded-full border-2 border-paper-light" style={{ background: 'var(--sage)' }} />
                <div className="font-ui text-sm text-ink-deep">{prettyQuery(l.userQuery)}</div>
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
