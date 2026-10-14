'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InkAmbience } from '@/components/workbench/ink-ambience';
import {
  Sparkles, PenLine, Quote, MessagesSquare, Bot, Compass, Image as ImageIcon, Map as MapIcon,
  Network, GraduationCap, ClipboardCheck, Users, BarChart3, Scale, FlaskConical, Plug,
  ArrowRight, LogOut, Moon, Sun,
} from 'lucide-react';

interface PortalUser { name: string | null; email: string | null; role?: string; avatar: string | null }
interface PortalStats { totalPoems: number; readCount: number; annotateCount: number; creationCount: number; favCount: number }

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

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

const numLabel = (n: number) => (n >= 10000 ? `${Math.round(n / 1000) / 10}万+` : `${n}`);

export function PortalClient({ user, stats }: { user: PortalUser; stats: PortalStats }) {
  const router = useRouter();
  const [dark, setDark] = useState(false);

  useEffect(() => { setDark(localStorage.getItem('theme') === 'dark'); }, []);
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

  const name = user.name || '诗词探索者';
  const statCards = [
    { label: '全库诗词', value: numLabel(stats.totalPoems), tint: '#7B8EA1' },
    { label: '我的研习', value: `${stats.readCount}`, tint: '#6B8E7B' },
    { label: 'AI 注解', value: `${stats.annotateCount}`, tint: '#8B7355' },
    { label: '风格创作', value: `${stats.creationCount}`, tint: '#A67C7C' },
  ];

  return (
    <div className="min-h-screen" data-theme={dark ? 'dark' : undefined} style={dark ? { background: '#1D1B18' } : undefined}>
      <InkAmbience />

      {/* ===== 顶栏（自包含，无侧栏） ===== */}
      <header className="glass-strong fixed inset-x-0 top-0 z-40 h-16 border-b border-light">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
          <Link href="/home" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full font-brush text-sm text-white shadow-ink" style={{ background: 'var(--brand-grad)' }}>墨</span>
            <span className="font-brush text-xl text-ink-deep">墨韵诗心</span>
          </Link>
          <div className="flex items-center gap-2">
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
        {/* ===== 欢迎区 ===== */}
        <section className="anim-fade-up">
          <h1 className="font-brush text-[40px] leading-tight text-ink-black md:text-[52px]">
            {greeting()}，{name}
          </h1>
          <p className="mt-3 font-ui text-[15px] leading-relaxed text-ink-soft">
            欢迎回到墨韵诗心 · AI 古诗词文化探索平台。这里汇聚 <span className="font-medium text-sepia">{numLabel(stats.totalPoems)}</span> 首全库诗篇，
            从探索、注解到创作，选择一项功能开始你的诗词之旅。
          </p>
        </section>

        {/* ===== 概览统计 ===== */}
        <section className="anim-fade-up mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4" style={{ animationDelay: '0.08s' }}>
          {statCards.map((s) => (
            <div key={s.label} className="paper-card p-5">
              <div className="font-brush text-[30px] leading-none" style={{ color: s.tint }}>{s.value}</div>
              <div className="mt-2 font-ui text-xs text-ink-soft">{s.label}</div>
            </div>
          ))}
        </section>

        {/* ===== 进入工作台 CTA ===== */}
        <section className="anim-fade-up mt-6" style={{ animationDelay: '0.12s' }}>
          <Link
            href="/workbench"
            className="paper-card paper-card-hover flex items-center justify-between p-6 transition-ink"
          >
            <div>
              <h2 className="font-brush text-2xl text-ink-black">进入功能工作台</h2>
              <p className="mt-1 font-ui text-sm text-ink-soft">左侧边栏汇聚全部 17 项功能，随时切换</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-lg px-5 py-3 font-ui text-sm font-medium transition-ink" style={{ background: 'var(--btn-grad)', color: '#fff' }}>
              进入工作台 <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </section>

        {/* ===== 功能入口分组 ===== */}
        {GROUPS.map((g, gi) => (
          <section key={g.title} className="anim-fade-up mt-12" style={{ animationDelay: `${0.16 + gi * 0.06}s` }}>
            <div className="mb-5">
              <h2 className="font-brush text-2xl text-ink-black">{g.title}</h2>
              <p className="mt-1 font-ui text-sm text-ink-soft">{g.desc}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it) => {
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className="paper-card paper-card-hover group flex items-start gap-4 p-5 transition-ink"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-ink" style={{ background: `${it.tint}1f`, color: it.tint }}>
                      <Icon className="h-5 w-5" />
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
