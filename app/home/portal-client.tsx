'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InkAmbience } from '@/components/workbench/ink-ambience';
import { CountUp } from '@/components/count-up';
import {
  Sparkles, PenLine, Quote, MessagesSquare, Bot, Compass, Image as ImageIcon, Map as MapIcon,
  Network, GraduationCap, ClipboardCheck, Users,
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
      { href: '/workbench/assistant', label: 'AI 助手', desc: '自由对话 · 多轮问答', icon: Bot, tint: '#5D5853' },
      { href: '/workbench/poet-chat', label: '诗人对话', desc: '与李白苏轼跨时空交谈', icon: MessagesSquare, tint: '#7B8EA1' },
      { href: '/workbench/feihua', label: '飞花令', desc: '与 AI 轮流吟诗对战', icon: Quote, tint: '#A67C7C' },
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
    title: '学习与交流',
    desc: '从诵读到分享的进阶路径',
    items: [
      { href: '/workbench/recite', label: '背诵闯关', desc: '逐句诵读 · 语音识别', icon: GraduationCap, tint: '#6B8E7B' },
      { href: '/workbench/community', label: '作品社区', desc: '创作分享与交流', icon: Users, tint: '#8B7355' },
    ],
  },
];

/** 管理员专属分组 */
const ADMIN_GROUP = {
  title: '管理后台',
  desc: '内容审核、用户管理、数据维护',
  items: [
    { href: '/admin', label: '数据总览', desc: '实时统计与待办', icon: ClipboardCheck, tint: '#5D5853' },
    { href: '/admin/users', label: '用户管理', desc: '账号 / 角色 / 停用', icon: Users, tint: '#7B8EA1' },
    { href: '/admin/poems', label: '诗词管理', desc: '全库诗词维护', icon: Compass, tint: '#6B8E7B' },
    { href: '/admin/posts', label: '帖子审核', desc: '内容审核 · 通过 / 拒绝', icon: ClipboardCheck, tint: '#8B7355' },
    { href: '/admin/shares', label: '作品审核', desc: '创作广场审核', icon: PenLine, tint: '#A67C7C' },
    { href: '/admin/feedback', label: '反馈处理', desc: '用户反馈回复', icon: MessagesSquare, tint: '#7B8EA1' },
    { href: '/admin/post-categories', label: '社区分类', desc: '板块分类维护', icon: MapIcon, tint: '#6B8E7B' },
    { href: '/admin/categories', label: '分类管理', desc: '诗词分类维护', icon: Network, tint: '#8B7355' },
  ],
};

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
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        if (heroBgRef.current) heroBgRef.current.style.transform = `translate3d(${nx * 10}px, ${ny * 8}px, 0)`;
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
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

  // 画卷题诗：固定取与青绿山水底图同一意境的题画诗（云、水、林叟），
  // 不用「每日一诗」——《枫桥夜泊》配青山瀑布会文不对画（页面下方仍有独立的每日一诗区块）
  const scrollTitle = '终南别业';
  const scrollVerse = ['行到水穷处', '坐看云起时'];

  return (
    <div className="min-h-screen overflow-x-clip" data-theme={dark ? 'dark' : undefined} style={dark ? { background: '#1D1B18' } : undefined}>
      <InkAmbience />

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

      <main className="mx-auto max-w-[1200px] px-6 pb-20 pt-[76px]">
        {/* ===== 欢迎区：宣纸水墨山水（三层远山推移 + 明月浮沉 + 雾带呼吸 + 墨点晕染 + 鼠标视差） ===== */}
        <section className="relative">
          {/* 纸形裁切：上下纸沿做成弧形起伏，像真实手卷摊开后的样子；objectBoundingBox 让路径随卡片宽度自适应 */}
          <svg width="0" height="0" className="absolute" aria-hidden="true">
            <defs>
              <clipPath id="scroll-wave" clipPathUnits="objectBoundingBox">
                <path d="M0,0.006 C0.10,0 0.19,0.026 0.30,0.010 C0.41,0 0.51,0.026 0.63,0.008 C0.75,0 0.85,0.024 1,0.004 L1,0.992 C0.90,1 0.80,0.974 0.68,0.990 C0.56,1 0.46,0.972 0.34,0.990 C0.22,1 0.12,0.976 0,0.994 Z" />
              </clipPath>
            </defs>
          </svg>

          {/* 卷纸层：clip-path 从中缝向两侧铺开，模拟书卷展开 */}
          <div className="anim-scroll-paper absolute inset-0" style={{ filter: 'drop-shadow(0 12px 20px rgba(62,48,30,0.20))' }}>
          {/* 纸形：弧形纸边包裹整幅画面 */}
          <div
            className="scroll-paper-shape absolute inset-0"
            style={{ background: 'linear-gradient(158deg, var(--paper-light) 0%, var(--paper) 52%, var(--paper-dark) 100%)' }}
          >

          {/* 青绿山水底图：整幅手卷的画卷本体（AI 生成），随鼠标做极轻视差 */}
          <div ref={heroBgRef} className="absolute -inset-3 will-change-transform" aria-hidden="true">
            <div
              className="absolute inset-0 bg-center bg-no-repeat"
              style={{ backgroundImage: "url('/images/scroll-landscape.jpg')", backgroundSize: 'auto 126%', backgroundPosition: '38% 58%' }}
            />
            {/* 山腰雾带：保留极轻的呼吸感，不抢画面 */}
            <div className="anim-ink-breathe absolute bottom-[26%] left-[6%] h-28 w-2/3 rounded-full blur-[50px]" style={{ background: 'rgba(252,250,244,0.55)' }} />
            <div className="anim-ink-spread absolute left-[10%] top-[46%] h-40 w-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 55%, transparent 76%)' }} />
          </div>

          {/* 左侧题字区：宣纸白遮罩，纸口透明、文字区压到 ~0.9，保证小屏与投影下也读得清 */}
          <div
            className="absolute inset-0"
            aria-hidden="true"
            style={{
              background: 'var(--paper-light)',
              opacity: 0.9,
              // 纸口处保持透明，让山水的墨色一直压到木轴边上；只在题字区压纸色
              maskImage: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.62) 3%, rgba(0,0,0,0.96) 10%, rgba(0,0,0,0.94) 46%, rgba(0,0,0,0.66) 54%, rgba(0,0,0,0.28) 60%, transparent 70%)',
              WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.62) 3%, rgba(0,0,0,0.96) 10%, rgba(0,0,0,0.94) 46%, rgba(0,0,0,0.66) 54%, rgba(0,0,0,0.28) 60%, transparent 70%)',
            }}
          />
          {/* 窄屏没有题诗列，文字更宽，整片压纸色避免压在山上读不清 */}
          <div className="absolute inset-0 md:hidden" aria-hidden="true" style={{ background: 'var(--paper-light)', opacity: 0.9 }} />
          <div className="absolute inset-x-0 top-0 h-24" aria-hidden="true" style={{ background: 'linear-gradient(to bottom, var(--paper-light) 0%, rgba(250,247,240,0.55) 45%, transparent 100%)' }} />
          <div className="absolute inset-x-0 bottom-0 h-20" aria-hidden="true" style={{ background: 'linear-gradient(to top, var(--paper-light), transparent)' }} />
          </div>
          </div>

          {/* 书卷两端木轴：随纸面展开同步滑向左右 */}
          <div className="scroll-roller anim-roller-left" aria-hidden="true" />
          <div className="scroll-roller anim-roller-right" aria-hidden="true" />
          {/* 轴内侧压暗，做出纸面卷曲的厚度感 */}
          <div className="scroll-paper-shape pointer-events-none absolute inset-y-0 left-0 z-10 w-9" aria-hidden="true" style={{ background: 'linear-gradient(90deg, rgba(90,66,41,0.16), transparent)' }} />
          <div className="scroll-paper-shape pointer-events-none absolute inset-y-0 right-0 z-10 w-9" aria-hidden="true" style={{ background: 'linear-gradient(270deg, rgba(90,66,41,0.16), transparent)' }} />

          <div className="anim-scroll-content relative z-10 px-6 py-16 text-center md:py-24 md:pl-16 md:pr-[300px] md:text-left lg:pl-20">
            <span className="font-ui text-[11px] tracking-[0.42em] text-sepia">AI · 古 典 诗 词 文 化 探 索 平 台</span>
            <h1 className="mt-3 font-brush text-[44px] leading-[1.08] text-ink-black md:text-[60px]" style={{ letterSpacing: '0.06em' }}>
              墨韵诗心
            </h1>
            <p className="mt-3 font-serif text-[14px] tracking-[0.14em] text-ink-mid md:text-[15px]">
              {greet}，{name}
            </p>
            <p className="mx-auto mt-5 max-w-[24rem] font-serif text-[14px] leading-[1.9] text-ink-mid md:mx-0 md:text-[15px]">
              读得懂、查得到、写得出——逐句注解、典故溯源与今译，
              也能把你今天的心情，写成一首有格律的古体诗。
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 md:justify-start">
              <Link
                href="/workbench/annotate"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-3 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover"
                style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
              >
                <Sparkles className="h-4 w-4" /> 开始 AI 注解
              </Link>
              <Link
                href="/workbench"
                className="group inline-flex items-center gap-1 font-ui text-sm text-ink-mid transition-ink hover:text-ink-black"
              >
                进入工作台
                <ArrowRight className="h-4 w-4 transition-ink group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* 窄屏：题款改为常规横排，首屏同样能读到真诗 */}
            <div className="mt-7 md:hidden">
              <p className="font-serif text-[13px] tracking-[0.16em] text-ink-mid">{scrollVerse.join('，')}</p>
              <p className="mt-1.5 font-ui text-[11px] tracking-[0.1em] text-ink-soft">唐 · 王维《{scrollTitle}》</p>
            </div>
          </div>

          {/* 右侧题诗：完整一联（行到水穷处 / 坐看云起时），题名一列，朱印落在末列下方 */}
          <div className="anim-scroll-poem absolute right-12 top-12 z-10 hidden select-none md:block" aria-hidden="true">
            {/* 淡宣纸光晕：竖排小字压在深色山体上也能读清 */}
            <div className="absolute -inset-x-4 -inset-y-3 -z-10 rounded-full blur-2xl" style={{ background: 'rgba(250,247,240,0.62)' }} />
            <div className="relative" style={{ writingMode: 'vertical-rl' }}>
              <p className="ml-8 font-brush text-[16px] leading-none text-ink-deep" style={{ letterSpacing: '0.3em' }}>{scrollTitle}</p>
              {scrollVerse.map((line, i) => (
                <p
                  key={i}
                  className="ml-8 font-serif text-[15px] leading-none text-ink-mid"
                  style={{ letterSpacing: '0.22em', animation: `scrollPoemLine 0.5s ease-out ${1.02 + i * 0.14}s both` }}
                >
                  {line}
                </p>
              ))}
            </div>
            {/* 朱印落在末列（最左一句）正下方，与列宽居中，留 12px 行距 */}
            <div className="mt-3 pl-[27px]">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-[2px] font-brush text-[9px] leading-none"
                style={{ background: '#A6321E', color: 'var(--paper-light)', animation: 'scrollContentIn 0.45s ease-out 1.5s both' }}
              >
                墨韵
              </span>
            </div>
          </div>
        </section>

        {/* 细朱线过渡：画卷与现代卡片之间留一道收束 */}
        <div className="mx-auto mt-10 h-px w-40" aria-hidden="true" style={{ background: 'linear-gradient(90deg, transparent, rgba(166,50,30,0.38), transparent)' }} />

        {/* ===== 功能入口（首页核心区：一进页面第一眼就看到所有功能） ===== */}
        <section className="mt-8">
          {(() => {
            const groups = user.role === 'admin' ? [ADMIN_GROUP, ...GROUPS] : GROUPS;
            return groups.map((g, gi) => (
              <div key={g.title} className={gi > 0 ? 'mt-10' : ''}>
                <div className="anim-fade-up mb-4" style={{ animationDelay: `${0.05 + gi * 0.08}s` }}>
                  <h2 className="font-brush text-xl text-ink-black">{g.title}</h2>
                  <p className="mt-0.5 font-ui text-xs text-ink-soft">{g.desc}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {g.items.map((it, ii) => {
                    const Icon = it.icon;
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        className="paper-card paper-card-hover group anim-fade-up flex items-center gap-3 p-4 transition-ink"
                        style={{ animationDelay: `${0.1 + gi * 0.08 + ii * 0.03}s` }}
                      >
                        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-ink group-hover:scale-110" style={{ background: `${it.tint}1f`, color: it.tint }}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 font-ui text-[14px] font-medium text-ink-deep">
                            <span className="truncate">{it.label}</span>
                            <ArrowRight className="h-3 w-3 shrink-0 -translate-x-1 opacity-0 transition-ink group-hover:translate-x-0 group-hover:opacity-100" />
                          </div>
                          <p className="truncate mt-0.5 font-ui text-[11px] text-ink-soft">{it.desc}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </section>

        {/* ===== 概览统计（count-up 滚动计数 + hover 溯源 tooltip） ===== */}
        <section className="anim-fade-up mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" style={{ animationDelay: '0.08s' }}>
          {statCards.map((s, i) => (
            <div key={s.label} className="paper-card group relative cursor-default p-5 transition-ink hover:-translate-y-1">
              {/* 上沿轻微卷边：高光收一道，承接上方画卷的纸质 */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-3 rounded-t-[11px]"
                style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.72), rgba(255,255,255,0))', boxShadow: 'inset 0 -2px 4px rgba(90,66,41,0.06)' }}
              />
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

        <footer className="mt-16 border-t border-light pt-8 text-center font-ui text-xs text-ink-soft">
          墨韵诗心 · AI 古诗词文化探索平台 · 大语言模型 + RAG 检索增强
        </footer>
      </main>
    </div>
  );
}
