'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InkAmbience } from '@/components/workbench/ink-ambience';
import { CountUp } from '@/components/count-up';
import { MotionToggle } from '@/components/motion-toggle';
import {
  Sparkles, PenLine, Quote, MessagesSquare, Bot, Compass, Image as ImageIcon, Map as MapIcon,
  Network, GraduationCap, ClipboardCheck, Users, BarChart3, Scale, FlaskConical, Plug,
  ArrowRight, LogOut, Moon, Sun, Heart, Search, Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PortalUser { name: string | null; email: string | null; role?: string; avatar: string | null }
interface PortalStats { totalPoems: number; readCount: number; annotateCount: number; creationCount: number; favCount: number }
interface DailyPoem { id: string; title: string; author: string; dynasty: string; lines: string[] }
interface Footprint { id: string; actionType: string; title: string; detail: string; time: string }

const GROUPS = [
  {
    title: 'AI 核心体验',
    desc: '大模型 + RAG 检索增强，句句可溯',
    items: [
      { href: '/workbench/annotate', label: 'AI 智能注解', desc: '四维度解析 · 引用硬约束', icon: Sparkles, tint: '#6B8E7B' },
      { href: '/workbench/transfer', label: '风格迁移', desc: '白话入诗 · 五大诗人风格', icon: PenLine, tint: '#8B7355' },
      { href: '/workbench/feihua', label: '飞花令', desc: '与 AI 轮流吟诗对战', icon: Quote, tint: '#A67C7C' },
      { href: '/workbench/poet-chat', label: '诗人对话', desc: '与李白苏轼跨时空交谈', icon: MessagesSquare, tint: '#7B8EA1' },
      { href: '/workbench/assistant', label: 'AI 助手', desc: '多轮问答 · RAG 引用溯源', icon: Bot, tint: '#5D5853' },
      { href: '/workbench/vision', label: '以图搜诗', desc: 'GLM-4V 识图 · 意象反查诗篇', icon: Eye, tint: '#7B8EA1' },
    ],
  },
  {
    title: '诗词探索',
    desc: '全库检索与多模态可视化',
    items: [
      { href: '/workbench/explore', label: '诗词探索', desc: '朝代 / 题材 / 意象多维筛选', icon: Compass, tint: '#7B8EA1' },
      { href: '/workbench/imagery', label: '意象图谱', desc: '高频意象可视化', icon: ImageIcon, tint: '#6B8E7B' },
      { href: '/workbench/imagery-timeline', label: '时空地图', desc: '意象朝代分布演变', icon: MapIcon, tint: '#8B7355' },
      { href: '/workbench/graph', label: '诗人图谱', desc: '诗人关系网络', icon: Network, tint: '#A67C7C' },
    ],
  },
  {
    title: '学习与挑战',
    desc: '从诵读到创作的进阶路径',
    items: [
      { href: '/workbench/recite', label: '背诵闯关', desc: '逐句诵读 · 语音识别', icon: GraduationCap, tint: '#6B8E7B' },
      { href: '/workbench/quiz', label: '诗词测验', desc: '选择 / 填空 / 鉴赏三题型', icon: ClipboardCheck, tint: '#7B8EA1' },
      { href: '/workbench/community', label: '作品社区', desc: '创作分享与交流', icon: Users, tint: '#8B7355' },
    ],
  },
  {
    title: '数据与工具',
    desc: '系统能力洞察与开放接口',
    items: [
      { href: '/workbench/stats', label: '数据大屏', desc: '全库统计可视化', icon: BarChart3, tint: '#5D5853' },
      { href: '/workbench/compare', label: '多模型对比', desc: '生成效果横向评测', icon: Scale, tint: '#7B8EA1' },
      { href: '/workbench/rag-eval', label: 'RAG 评测', desc: '检索增强效果评估', icon: FlaskConical, tint: '#6B8E7B' },
      { href: '/workbench/mcp', label: 'MCP 工具', desc: '对外开放工具接口', icon: Plug, tint: '#8B7355' },
    ],
  },
];

/** 研习足迹：动作类型 → 图标 / 墨彩（与功能入口同色系，保持视觉语言统一） */
const ACTION_META: Record<string, { icon: LucideIcon; tint: string }> = {
  annotate: { icon: Sparkles, tint: '#6B8E7B' },
  transfer: { icon: PenLine, tint: '#8B7355' },
  feihua: { icon: Quote, tint: '#A67C7C' },
  assistant: { icon: Bot, tint: '#5D5853' },
  favorite: { icon: Heart, tint: '#A67C7C' },
  quiz: { icon: ClipboardCheck, tint: '#7B8EA1' },
  recite: { icon: GraduationCap, tint: '#6B8E7B' },
};
const ACTION_FALLBACK = { icon: Compass, tint: '#7B8EA1' };

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

const numLabel = (n: number) => (n >= 10000 ? `${Math.round(n / 1000) / 10}万+` : `${n}`);

export function PortalClient({
  user,
  stats,
  daily,
  footprints,
}: {
  user: PortalUser;
  stats: PortalStats;
  daily: DailyPoem | null;
  footprints: Footprint[];
}) {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  // 问候语依赖本地小时数：SSR 固定中性值，挂载后校正（useEffect 后置），避免水合不一致
  const [greet, setGreet] = useState('你好');
  const [kw, setKw] = useState('');
  const heroBgRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDark(localStorage.getItem('theme') === 'dark'); }, []);
  useEffect(() => { setGreet(greeting()); }, []);

  // Hero 鼠标视差：作用于山水图包裹层（不碰 img 自身的 anim-ink-pan 动画，避免 transform 冲突）；
  // 直写 DOM transform（rAF 节流）；仅指针精确设备启用，reduced-motion 时静止。
  // 运行时响应：动效开关切换即时生效——onMove 内实时判定 motion-off 并归位，MutationObserver 保证
  // 切换瞬间无需等待鼠标移动即把视差归位（修复"关掉开关后鼠标仍拖动图片"的缺口）。
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (document.documentElement.classList.contains('motion-off')) {
        if (heroBgRef.current) heroBgRef.current.style.transform = '';
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        if (heroBgRef.current) heroBgRef.current.style.transform = `translate3d(${nx * 10}px, ${ny * 8}px, 0)`;
      });
    };
    // 监听 html class 变化：关闭动效时立即把山水图归位（不依赖下一次 mousemove）
    const observer = new MutationObserver(() => {
      if (document.documentElement.classList.contains('motion-off') && heroBgRef.current) {
        heroBgRef.current.style.transform = '';
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  function toggleTheme() {
    setDark((v) => {
      const nv = !v;
      localStorage.setItem('theme', nv ? 'dark' : 'light');
      return nv;
    });
  }
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  function goSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = kw.trim();
    if (q) router.push(`/workbench/explore?q=${encodeURIComponent(q)}`);
  }

  const name = user.name || '诗词探索者';
  // 统计卡：数字入视口滚动计数 + hover 溯源 tooltip（与登录页同一模式，答辩可现场展示出处）
  const statCards = [
    { label: '全库诗词', value: Math.round(stats.totalPoems / 1000) / 10, suffix: '万+', tint: '#7B8EA1', tip: `来源：poems 表实时 COUNT(*) = ${stats.totalPoems.toLocaleString()} 首` },
    { label: '我的研习', value: stats.readCount, suffix: '', tint: '#6B8E7B', tip: '来源：histories 表按 targetId 去重（读过的不同诗篇数）' },
    { label: 'AI 注解', value: stats.annotateCount, suffix: '', tint: '#8B7355', tip: '来源：histories 表 actionType=annotate 计数' },
    { label: '风格创作', value: stats.creationCount, suffix: '', tint: '#A67C7C', tip: '来源：creations 表 COUNT(*)' },
    { label: '我的收藏', value: stats.favCount, suffix: '', tint: '#C4A965', tip: '来源：favorites 表 COUNT(*)' },
  ];

  return (
    <div className="min-h-screen overflow-x-clip" data-theme={dark ? 'dark' : undefined} style={dark ? { background: '#1D1B18' } : undefined}>
      <InkAmbience />
      <MotionToggle />

      {/* ===== 顶栏（自包含，无侧栏） ===== */}
      <header className="glass-strong fixed inset-x-0 top-0 z-40 h-16 border-b border-light">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
          <Link href="/home" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full font-brush text-sm text-white shadow-ink" style={{ background: 'var(--brand-grad)' }}>墨</span>
            <span className="font-brush text-xl text-ink-deep">墨韵诗心</span>
          </Link>
          <div className="flex items-center gap-2">
            {/* 快捷搜索：回车直达诗词探索页检索结果 */}
            <form onSubmit={goSearch} className="relative hidden md:block" role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
              <input
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                placeholder="搜诗词 / 诗人…"
                aria-label="搜索诗词"
                className="h-9 w-40 rounded-full border border-transparent pl-8 pr-3 font-ui text-sm text-ink-deep outline-none transition-ink placeholder:text-ink-soft/70 focus:w-56 focus:border-c"
                style={{ background: 'var(--inset)' }}
              />
            </form>
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-mid transition-ink hover:bg-paper-dark"
              aria-label="切换夜色主题"
              title={dark ? '切换为宣纸色' : '切换为夜色'}
            >
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <div className="hidden items-center gap-2.5 rounded-full py-1 pl-1 pr-3 sm:flex" style={{ background: 'var(--inset)' }}>
              {user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt={name} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full font-brush text-sm text-white" style={{ background: 'var(--brand-grad)' }}>{name[0]}</span>
              )}
              <span className="font-ui text-sm text-ink-deep">{name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 pb-20 pt-24">
        {/* ===== 欢迎区：宣纸水墨山水（三层远山推移 + 明月浮沉 + 雾带呼吸 + 墨点晕染 + 鼠标视差） ===== */}
        <section className="anim-fade-up relative overflow-hidden rounded-2xl border border-light shadow-ink">
          {/* 底色：宣纸渐变（全部走主题变量，明暗模式自适应） */}
          <div className="absolute inset-0" aria-hidden="true" style={{ background: 'linear-gradient(158deg, var(--paper-light) 0%, var(--paper) 52%, var(--paper-dark) 100%)' }} />

          {/* 景深层：视差包裹（-inset-3 出血，位移时不露边） */}
          <div ref={heroBgRef} className="absolute -inset-3 will-change-transform" aria-hidden="true">
            {/* 明月：右上金色晕染，缓慢浮沉 */}
            <div
              className="anim-ink-float absolute right-[12%] top-[14%] h-24 w-24 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(196,169,101,0.42) 0%, rgba(196,169,101,0.16) 52%, rgba(196,169,101,0) 72%)' }}
            />
            {/* 飞鸟：极淡笔触，随远山漂移 */}
            <svg className="anim-ink-drift absolute right-[26%] top-[22%] text-ink-mid" width="64" height="26" viewBox="0 0 64 26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ opacity: 0.32 }}>
              <path d="M4 14q7-8 14 0M26 8q6-7 12 0" />
            </svg>
            {/* 远山：最淡，向右漂移 */}
            <svg viewBox="0 0 1200 320" preserveAspectRatio="none" className="anim-ink-drift absolute bottom-0 left-[-5%] h-[60%] w-[110%] text-ink-soft" fill="currentColor" style={{ opacity: 0.16 }}>
              <path d="M0 320V196Q110 128 232 172T470 142T720 118T968 158T1200 134V320Z" />
            </svg>
            {/* 山腰雾带：横贯呼吸 */}
            <div className="anim-ink-breathe absolute bottom-[34%] left-[14%] h-24 w-1/2 rounded-full blur-[46px]" style={{ background: 'rgba(250,248,243,0.6)' }} />
            {/* 中景山：反向漂移，形成层次错动 */}
            <svg viewBox="0 0 1200 320" preserveAspectRatio="none" className="anim-ink-drift absolute bottom-0 left-[-5%] h-[46%] w-[110%] text-ink-mid" fill="currentColor" style={{ opacity: 0.2, animationDelay: '-5s', animationDirection: 'reverse' }}>
              <path d="M0 320V238Q150 158 304 210T604 184T902 214T1200 190V320Z" />
            </svg>
            {/* 近景坡：最浓，静止压住画面底部 */}
            <svg viewBox="0 0 1200 320" preserveAspectRatio="none" className="absolute bottom-0 left-0 h-[32%] w-full text-ink-deep" fill="currentColor" style={{ opacity: 0.22 }}>
              <path d="M0 320V268Q182 208 382 252T722 238T1042 260T1200 248V320Z" />
            </svg>
            {/* 墨点晕染：山腰周期扩散 */}
            <div className="anim-ink-spread absolute left-[8%] top-[38%] h-40 w-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(139,115,85,0.20) 0%, rgba(139,115,85,0.05) 55%, transparent 76%)' }} />
          </div>

          {/* 左侧宣纸渐隐：压住山色保证标题可读（随主题自适应） */}
          <div className="absolute inset-0" aria-hidden="true" style={{ background: 'linear-gradient(100deg, var(--paper-light) 0%, var(--paper-light) 40%, transparent 78%)' }} />
          <div className="absolute inset-x-0 bottom-0 h-24" aria-hidden="true" style={{ background: 'linear-gradient(to top, var(--paper-dark), transparent)' }} />

          <div className="relative z-10 px-7 py-10 md:px-12 md:py-14">
            <span className="font-ui text-[11px] tracking-[0.42em] text-sepia">墨 韵 诗 心</span>
            <h1 className="mt-4 font-brush text-[36px] leading-tight text-ink-black md:text-[54px]">
              {greet}，{name}
            </h1>
            <p className="mt-4 max-w-2xl font-serif text-[15px] leading-relaxed text-ink-mid md:text-[16px]">
              以墨为舟，溯千年诗心。平台汇聚 <span className="font-medium text-sepia">{numLabel(stats.totalPoems)}</span> 首中华诗篇，
              以大语言模型与 RAG 检索增强，陪你读诗、解诗、作诗 —— 让千年文脉，在指尖重生。
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/workbench"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-3 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover"
                style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
              >
                进入功能工作台 <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/workbench/annotate"
                className="inline-flex items-center gap-2 rounded-lg border border-c px-5 py-3 font-ui text-sm font-medium text-ink-deep transition-ink hover:-translate-y-0.5 hover:border-ink-mid hover:bg-paper-dark"
              >
                <Sparkles className="h-4 w-4" /> 开始 AI 注解
              </Link>
            </div>
            <p className="mt-7 font-serif text-[13px] tracking-wide text-ink-soft">
              「 行到水穷处 · 坐看云起时 」
            </p>
          </div>
        </section>

        {/* ===== 概览统计（count-up 滚动计数 + hover 溯源 tooltip） ===== */}
        <section className="anim-fade-up mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" style={{ animationDelay: '0.08s' }}>
          {statCards.map((s, i) => (
            <div key={s.label} className="paper-card group relative cursor-default p-5 transition-ink hover:-translate-y-1">
              {/* 数据溯源 tooltip：hover 显示出处，数字不再"空口无凭"，答辩可现场演示 */}
              <span className="pointer-events-none absolute -top-1.5 left-1/2 z-30 max-w-[85vw] -translate-x-1/2 -translate-y-full whitespace-normal rounded-lg bg-ink-deep px-2.5 py-1.5 text-center font-ui text-[11px] text-paper-light opacity-0 shadow-ink transition-ink group-hover:opacity-100 sm:whitespace-nowrap">
                {s.tip}
              </span>
              <div className="font-brush text-[30px] leading-none" style={{ color: s.tint }}>
                <CountUp value={s.value} decimals={Number.isInteger(s.value) ? 0 : 1} suffix={s.suffix} delay={i * 120} />
              </div>
              <div className="mt-2 font-ui text-xs text-ink-soft">{s.label}</div>
            </div>
          ))}
        </section>

        {/* ===== 每日一诗 + 研习足迹（门户个性化双卡） ===== */}
        <section className="anim-fade-up mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '0.14s' }}>
          {/* 每日一诗：当日全站同一签，真实库数据（优质库确定性取签），点击直达 AI 注解 */}
          {daily && daily.lines.length > 0 && (
            <div className="paper-card paper-card-hover p-6">
              <div className="flex items-center gap-2">
                <span className="rounded-full px-2 py-0.5 font-ui text-[10px] tracking-wide" style={{ background: 'rgba(196,169,101,0.14)', color: '#8B7355' }}>每日一诗</span>
                <span className="font-ui text-[11px] text-ink-soft/70">当日全站同一签 · 次日轮换</span>
              </div>
              <div className="mt-4 space-y-1.5">
                {daily.lines.map((l) => (
                  <p key={l} className="font-serif text-lg leading-relaxed text-ink-deep">{l}</p>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-ui text-xs text-ink-soft">〔{daily.dynasty}〕{daily.author}《{daily.title}》</span>
                <Link href={`/workbench/annotate?poem=${daily.id}`} className="inline-flex shrink-0 items-center gap-1 font-ui text-xs text-muted-blue transition-ink hover:gap-1.5">
                  让 AI 注解这一首 <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
          {/* 研习足迹：最近 5 条真实行为记录（histories 表），图标墨彩与功能入口同色系 */}
          <div className={`paper-card p-6 ${daily && daily.lines.length > 0 ? '' : 'lg:col-span-2'}`}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-ui text-[15px] font-medium text-ink-deep">最近足迹</h3>
              <Link href="/workbench" className="font-ui text-xs text-muted-blue transition-ink hover:underline">工作台 →</Link>
            </div>
            {footprints.length === 0 ? (
              <p className="py-6 text-center font-ui text-sm text-ink-soft">
                还没有足迹，<Link href="/workbench/explore" className="text-muted-blue transition-ink hover:underline">去诗词探索页看看</Link>
              </p>
            ) : (
              <div className="space-y-1">
                {footprints.map((f) => {
                  const meta = ACTION_META[f.actionType] ?? ACTION_FALLBACK;
                  const Icon = meta.icon;
                  return (
                    <div key={f.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-ink hover:bg-paper-dark/60" title={f.detail || undefined}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: `${meta.tint}1f`, color: meta.tint }}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex-1 truncate font-ui text-sm text-ink-mid">{f.title}</span>
                      <span className="shrink-0 font-ui text-xs text-ink-soft">{f.time}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ===== 功能入口分组（卡片级 stagger + 图标墨晕 hover） ===== */}
        {GROUPS.map((g, gi) => (
          <section key={g.title} className="mt-12">
            <div className="anim-fade-up mb-5" style={{ animationDelay: `${0.2 + gi * 0.1}s` }}>
              <h2 className="font-brush text-2xl text-ink-black">{g.title}</h2>
              <p className="mt-1 font-ui text-sm text-ink-soft">{g.desc}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it, ii) => {
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className="paper-card paper-card-hover group anim-fade-up flex items-start gap-4 p-5 transition-ink"
                    style={{ animationDelay: `${0.26 + gi * 0.1 + ii * 0.05}s` }}
                  >
                    {/* 图标：hover 时容器微抬 + 背后墨晕扩散（pastel tint 光晕） */}
                    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-ink group-hover:scale-110" style={{ background: `${it.tint}1f`, color: it.tint }}>
                      <span aria-hidden="true" className="absolute -inset-1.5 rounded-2xl opacity-0 blur-md transition-ink group-hover:opacity-100" style={{ background: `${it.tint}40` }} />
                      <Icon className="relative h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-ui text-[15px] font-medium text-ink-deep">
                        {it.label}
                        <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-ink group-hover:translate-x-0 group-hover:opacity-100" />
                      </div>
                      <p className="mt-1 font-ui text-xs leading-relaxed text-ink-soft">{it.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        <footer className="mt-16 border-t border-light pt-8 text-center font-ui text-xs text-ink-soft">
          墨韵诗心 · AI 古诗词文化探索平台 · 大语言模型 + RAG 检索增强
        </footer>
      </main>
    </div>
  );
}
