'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { InkAmbience } from '@/components/workbench/ink-ambience';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

const NAV: { label: string; href: string; icon: string; badge?: 'posts' | 'shares' | 'feedback' }[] = [
  { label: '数据总览', href: '/admin', icon: 'chart' },
  { label: '用户管理', href: '/admin/users', icon: 'users' },
  { label: '诗词管理', href: '/admin/poems', icon: 'book' },
  { label: '帖子审核', href: '/admin/posts', icon: 'check', badge: 'posts' },
  { label: '作品审核', href: '/admin/shares', icon: 'check', badge: 'shares' },
  { label: '社区分类', href: '/admin/post-categories', icon: 'tag' },
  { label: '反馈处理', href: '/admin/feedback', icon: 'mail', badge: 'feedback' },
  { label: '分类管理', href: '/admin/categories', icon: 'tag' },
];

function NavIcon({ name }: { name: string }) {
  const c = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'chart': return <svg {...c}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" rx="0.5" /><rect x="12" y="8" width="3" height="10" rx="0.5" /><rect x="17" y="5" width="3" height="13" rx="0.5" /></svg>;
    case 'users': return <svg {...c}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'book': return <svg {...c}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
    case 'check': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5.5" /></svg>;
    case 'mail': return <svg {...c}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
    case 'tag': return <svg {...c}><path d="M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" /></svg>;
    default: return null;
  }
}

interface Todo { posts: number; shares: number; feedback: number }

export function AdminShell({ user, children }: { user: { name?: string | null; email?: string | null }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [todo, setTodo] = useState<Todo>({ posts: 0, shares: 0, feedback: 0 });
  const [loggingOut, setLoggingOut] = useState(false);
  const active = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));

  // 侧边栏待办数与管理端各页面同源，10 秒同步一次，不必切页面才知道有新投稿
  const loadTodo = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setTodo({
        posts: d.metrics?.postsPending || 0,
        shares: d.metrics?.sharesPending || 0,
        feedback: d.metrics?.feedbackOpen || 0,
      });
    } catch {
      // 网络抖动保留上一次数字
    }
  }, []);

  useEffect(() => { loadTodo(); }, [loadTodo]);
  useAutoRefresh(loadTodo, 10000);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const badgeOf = (key?: 'posts' | 'shares' | 'feedback') =>
    key === 'posts' ? todo.posts : key === 'shares' ? todo.shares : key === 'feedback' ? todo.feedback : 0;

  return (
    <div className="relative isolate min-h-screen">
      {/* 水墨氛围背景：与管理后台共用水墨基调 */}
      <InkAmbience />
      <header className="glass-strong fixed inset-x-0 top-0 z-40 h-16 border-b border-light">
        <div className="flex h-full items-center gap-3 px-4 md:px-6">
          <button className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-mid transition-ink hover:bg-paper-dark lg:hidden" onClick={() => setOpen(!open)} aria-label="菜单">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
          </button>
          <span className="flex h-9 w-9 items-center justify-center rounded-full font-brush text-sm text-white shadow-ink" style={{ background: 'linear-gradient(135deg, #5D5853, #8B7355)' }}>管</span>
          <div>
            <div className="font-brush text-lg leading-tight text-ink-deep">墨韵诗心 · 管理后台</div>
            <div className="font-ui text-[10px] leading-tight text-ink-soft">RBAC 权限控制 · 仅管理员可见</div>
          </div>
          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <span className="hidden font-ui text-xs text-ink-soft md:block">{user.name || user.email}</span>
            <button onClick={handleLogout} disabled={loggingOut} className="rounded-lg border border-c px-3 py-1.5 font-ui text-xs transition-ink hover:bg-paper-dark disabled:opacity-50" style={{ color: '#A67C7C' }}>
              {loggingOut ? '退出中…' : '退出登录'}
            </button>
          </div>
        </div>
      </header>

      {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed left-0 top-16 z-40 w-56 border-r border-light bg-paper-light transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ height: 'calc(100vh - 4rem)' }}
      >
        <nav className="flex flex-col gap-1 p-4">
          {NAV.map((n) => {
            const count = badgeOf(n.badge);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-ui text-sm transition-ink"
                style={active(n.href) ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' } : { color: 'var(--ink-mid)' }}
              >
                <NavIcon name={n.icon} />
                <span className="flex-1">{n.label}</span>
                {count > 0 && (
                  <span
                    className="inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 font-ui text-[10px] font-medium leading-none text-white"
                    style={{ background: n.badge === 'posts' ? '#C4A965' : n.badge === 'shares' ? '#7B8EA1' : '#A67C7C' }}
                    title={`${count} 条待处理`}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 pt-2 font-ui text-[10px] leading-relaxed text-ink-soft">
          待办数字每 10 秒同步<br />当前待审 {todo.posts} 帖 · {todo.shares} 作品 · {todo.feedback} 反馈
        </div>
      </aside>

      <main className="ml-0 pt-16 lg:ml-56">
        <div className="mx-auto max-w-[1200px] p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
