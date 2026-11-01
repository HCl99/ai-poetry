'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ProfileModal } from './profile-modal';
import { InkAmbience } from './ink-ambience';
import { Onboarding } from './onboarding';

type NavItem = { key: string; label: string; href: string; icon: string };

/** 置顶入口：门户与工作台 */
const NAV_TOP: NavItem[] = [
  { key: 'portal', label: '系统首页', href: '/home', icon: 'portal' },
  { key: 'dashboard', label: '工作台', href: '/workbench', icon: 'home' },
];

/** 分组导航：组名即 AI 信号，不再逐项打「AI」徽章 */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'AI 创作',
    items: [
      { key: 'annotate', label: 'AI智能注解', href: '/workbench/annotate', icon: 'sparkles' },
      { key: 'transfer', label: '风格迁移', href: '/workbench/transfer', icon: 'edit' },
      { key: 'assistant', label: 'AI 助手', href: '/workbench/assistant', icon: 'bot' },
      { key: 'poet-chat', label: '诗人对话', href: '/workbench/poet-chat', icon: 'chat' },
      { key: 'vision', label: '以图搜诗', href: '/workbench/vision', icon: 'eye' },
      { key: 'creations', label: '我的创作', href: '/workbench/creations', icon: 'image' },
    ],
  },
  {
    label: '探索学习',
    items: [
      { key: 'explore', label: '诗词探索', href: '/workbench/explore', icon: 'book' },
      { key: 'recite', label: '背诵闯关', href: '/workbench/recite', icon: 'grad' },
      { key: 'quiz', label: '诗词测验', href: '/workbench/quiz', icon: 'clipboard' },
      { key: 'feihua', label: '飞花令', href: '/workbench/feihua', icon: 'quote' },
      { key: 'community', label: '作品社区', href: '/workbench/community', icon: 'users' },
    ],
  },
  {
    label: '图谱数据',
    items: [
      { key: 'imagery', label: '意象图谱', href: '/workbench/imagery', icon: 'image' },
      { key: 'imagery-timeline', label: '时空地图', href: '/workbench/imagery-timeline', icon: 'timeline' },
      { key: 'graph', label: '诗人图谱', href: '/workbench/graph', icon: 'network' },
      { key: 'stats', label: '数据大屏', href: '/workbench/stats', icon: 'chart' },
    ],
  },
  {
    label: '系统透明',
    items: [
      { key: 'compare', label: '多模型对比', href: '/workbench/compare', icon: 'scale' },
      { key: 'rag-eval', label: 'RAG评测', href: '/workbench/rag-eval', icon: 'flask' },
      { key: 'mcp', label: 'MCP 工具', href: '/workbench/mcp', icon: 'plug' },
    ],
  },
];

/** 通知面板的「系统公告」：展示近期平台能力更新（真实已上线功能） */
const ANNOUNCEMENTS = [
  { title: 'AI 教学课件生成已上线', desc: '诗词详情页可一键生成七节结构课件', date: '10/13' },
  { title: '飞花令新增「求提示」', desc: '每局 3 次，可参考未用过的含令字诗句', date: '10/13' },
  { title: '朗读增强上线', desc: '支持语速与音色设置、逐句高亮跟读', date: '10/12' },
];

function NavIcon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'home': return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
    case 'portal': return <svg {...common}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>;
    case 'book': return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
    case 'grad': return <svg {...common}><path d="M22 9 12 4 2 9l10 5 10-5z" /><path d="M6 11.5V16c0 1.66 2.69 3 6 3s6-1.34 6-3v-4.5" /><path d="M22 9v5" /></svg>;
    case 'sparkles': return <svg {...common}><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" /></svg>;
    case 'edit': return <svg {...common}><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>;
    case 'image': return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4-4-8 8" /></svg>;
    case 'eye': return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'network': return <svg {...common}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="m8 7.5 7.5.3M7 8.5l4 7M16.5 10.5l-3.5 5.5" /></svg>;
    case 'chart': return <svg {...common}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" rx="0.5" /><rect x="12" y="8" width="3" height="10" rx="0.5" /><rect x="17" y="5" width="3" height="13" rx="0.5" /></svg>;
    case 'users': return <svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'quote': return <svg {...common}><path d="M3 21c3-1 5-3.5 5-7V7a4 4 0 0 0-4-4H3v8h4" /><path d="M14 21c3-1 5-3.5 5-7V7a4 4 0 0 0-4-4h-1v8h4" /></svg>;
    case 'chat': return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case 'scale': return <svg {...common}><path d="M12 3v18" /><path d="M5 7l7-4 7 4" /><path d="M3 13l2-6 2 6a3.5 3.5 0 0 1-4 0z" /><path d="M17 13l2-6 2 6a3.5 3.5 0 0 1-4 0z" /><path d="M8 21h8" /></svg>;
    case 'flask': return <svg {...common}><path d="M9 3h6" /><path d="M10 3v6L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" /><path d="M7.5 14h9" /></svg>;
    case 'timeline': return <svg {...common}><path d="M3 3v18h18" /><path d="m6 15 4-5 3 3 5-7" /><circle cx="6" cy="15" r="1.2" /><circle cx="10" cy="10" r="1.2" /><circle cx="13" cy="13" r="1.2" /><circle cx="18" cy="6" r="1.2" /></svg>;
    case 'plug': return <svg {...common}><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" /></svg>;
    case 'shield': return <svg {...common}><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" /><path d="m9 11.5 2 2 4-4.5" /></svg>;
    case 'bot': return <svg {...common}><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V4M8 4h8" /><circle cx="9" cy="14" r="1" fill="currentColor" /><circle cx="15" cy="14" r="1" fill="currentColor" /></svg>;
    case 'clipboard': return <svg {...common}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 13 2 2 4-4.5" /></svg>;
    default: return null;
  }
}

export function WorkbenchShell({ user, children }: { user: { id: string; name?: string | null; email?: string | null; role?: string; avatar?: string | null }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dark, setDark] = useState(false);

  // 通知面板：系统公告 + 我的最近动态（真实数据）
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<{ id: string; typeLabel: string; title: string; time: string; color: string }[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // 点击面板外关闭
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // 展开时拉取最近动态（仅首次）
  useEffect(() => {
    if (!notifOpen || notifs.length > 0) return;
    setNotifLoading(true);
    fetch('/api/user/history')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setNotifs(Array.isArray(list) ? list.slice(0, 6) : []))
      .catch(() => {})
      .finally(() => setNotifLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen]);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // 夜色主题：localStorage 持久化
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
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen" data-theme={dark ? 'dark' : undefined} style={{ background: 'var(--paper)' }}>
      {/* 水墨氛围背景：墨晕呼吸 + 墨滴扩散 + 明月轻浮（-z 层，不遮挡内容） */}
      <InkAmbience />
      {/* 顶部栏 */}
      <header className="glass-strong fixed inset-x-0 top-0 z-40 h-16 border-b border-light">
        <div className="flex h-full items-center gap-4 px-4 md:px-6">
          <button className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-mid transition-ink hover:bg-paper-dark lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="菜单">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
          </button>
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-brush text-sm text-white shadow-ink" style={{ background: 'var(--brand-grad)' }}>墨</span>
            <span className="whitespace-nowrap font-brush text-xl text-ink-deep">墨韵诗心</span>
          </Link>
          <div className="mx-auto hidden w-full max-w-[480px] items-center md:flex">
            <div className="relative w-full">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              </span>
              <form action="/workbench/explore" className="w-full">
                <input name="q" placeholder="搜索诗题、作者…" className="h-10 w-full rounded-full border border-c pl-10 pr-4 font-ui text-sm outline-none transition-ink focus:border-ink-mid" style={{ background: 'color-mix(in srgb, var(--paper-light) 70%, transparent)' }} />
              </form>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-mid transition-ink hover:bg-paper-dark"
              aria-label="切换夜色主题"
              title={dark ? '切换为宣纸色' : '切换为夜色'}
            >
              {dark ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg>
              )}
            </button>
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-mid transition-ink hover:bg-paper-dark"
                aria-label="通知"
                aria-expanded={notifOpen}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: 'var(--rose)' }} />
              </button>
              {notifOpen && (
                <div
                  className="anim-fade-up absolute right-0 top-11 z-50 w-[330px] overflow-hidden rounded-xl border border-light shadow-ink"
                  style={{ background: 'var(--paper-light)' }}
                >
                  <div className="border-b border-light px-4 py-3 font-ui text-sm font-medium text-ink-deep">通知</div>
                  <div className="max-h-[360px] overflow-y-auto">
                    <div className="px-4 pb-1 pt-3 font-ui text-[11px] text-ink-soft">系统公告</div>
                    {ANNOUNCEMENTS.map((a) => (
                      <div key={a.title} className="px-4 py-2.5 transition-ink hover:bg-paper-dark">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-ui text-[13px] font-medium text-ink-deep">{a.title}</span>
                          <span className="shrink-0 font-ui text-[10px] text-ink-soft">{a.date}</span>
                        </div>
                        <p className="mt-0.5 font-ui text-xs leading-relaxed text-ink-soft">{a.desc}</p>
                      </div>
                    ))}
                    <div className="border-t border-light px-4 pb-1 pt-3 font-ui text-[11px] text-ink-soft">我的最近动态</div>
                    {notifLoading && <p className="px-4 pb-3 font-ui text-xs text-ink-soft">加载中…</p>}
                    {!notifLoading && notifs.length === 0 && (
                      <p className="px-4 pb-3 font-ui text-xs text-ink-soft">暂无动态，去探索诗词吧</p>
                    )}
                    {notifs.map((n) => (
                      <div key={n.id} className="flex items-start gap-2.5 px-4 py-2.5 transition-ink hover:bg-paper-dark">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: n.color }} />
                        <div className="min-w-0">
                          <div className="font-ui text-[13px] text-ink-deep">
                            <span className="text-ink-soft">{n.typeLabel} · </span>
                            {n.title}
                          </div>
                          <p className="mt-0.5 font-ui text-[11px] text-ink-soft">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 侧边栏 */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside
        className={`fixed left-0 top-16 z-40 flex h-[calc(100vh-4rem)] w-60 flex-col border-r border-light bg-paper-light transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <nav className="flex flex-col gap-1 overflow-y-auto p-4">
          {NAV_TOP.map((n) => {
            const active = n.href === '/workbench' ? pathname === '/workbench' : pathname.startsWith(n.href);
            return (
              <Link
                key={n.key}
                href={n.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-ui text-sm transition-ink"
                style={active ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' } : { color: 'var(--ink-mid)' }}
              >
                <NavIcon name={n.icon} />
                {n.label}
              </Link>
            );
          })}
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="mt-3">
              <div className="mb-1.5 px-3 font-ui text-[11px] tracking-wide text-ink-soft">{g.label}</div>
              <div className="flex flex-col gap-1">
                {g.items.map((n) => {
                  const active = pathname === n.href || pathname.startsWith(n.href + '/');
                  return (
                    <Link
                      key={n.key}
                      href={n.href}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 font-ui text-sm transition-ink"
                      style={active ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' } : { color: 'var(--ink-mid)' }}
                    >
                      <NavIcon name={n.icon} />
                      {n.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          {user.role === 'admin' && (
            <>
              <div className="mb-2 mt-3 px-3 font-ui text-xs text-ink-soft">管理</div>
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-ui text-sm transition-ink"
                style={pathname.startsWith('/admin') ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' } : { color: 'var(--ink-mid)' }}
              >
                <NavIcon name="shield" />
                管理后台
              </Link>
            </>
          )}
        </nav>
        <div className="mt-auto border-t border-light p-4">
          <button onClick={() => setProfileOpen(true)} className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-ink hover:bg-paper-dark">
            {user.avatar ? (
              <img src={user.avatar} alt="头像" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full font-brush text-sm text-white" style={{ background: 'var(--brand-grad)' }}>
                {(user.name || user.email || '客')[0]}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper-light" style={{ background: 'var(--sage)' }} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-ui text-sm text-ink-deep">{user.name || '诗词探索者'}</span>
              <span className="block truncate font-ui text-xs text-ink-soft">{user.email}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink-soft"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="ml-0 pt-16 lg:ml-60">
        <div className="mx-auto max-w-[1400px] p-4 md:p-6">{children}</div>
      </main>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={{ name: user.name || '诗词探索者', email: user.email || '', avatar: user.avatar }}
        onLogout={handleLogout}
      />

      {/* 新手引导：首次进入工作台的三步导览，完成后 localStorage 持久化 */}
      <Onboarding />
    </div>
  );
}
