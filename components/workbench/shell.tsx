'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ProfileModal, type Sub as ProfileSub } from './profile-modal';
import { InkAmbience } from './ink-ambience';
import { Onboarding } from './onboarding';
import { DirectionModal } from './direction-modal';

type NavItem = { key: string; label: string; href: string; icon: string };

/** 置顶入口：门户与工作台 */
const NAV_TOP: NavItem[] = [
  { key: 'portal', label: '系统首页', href: '/home', icon: 'portal' },
  { key: 'dashboard', label: '工作台', href: '/workbench', icon: 'home' },
];

/** 管理员专属导航：直接展开，不再收纳 */
const ADMIN_NAV: NavItem[] = [
  { key: 'admin-home', label: '数据总览', href: '/admin', icon: 'chart' },
  { key: 'admin-users', label: '用户管理', href: '/admin/users', icon: 'users' },
  { key: 'admin-poems', label: '诗词管理', href: '/admin/poems', icon: 'book' },
  { key: 'admin-posts', label: '帖子审核', href: '/admin/posts', icon: 'check' },
  { key: 'admin-shares', label: '作品审核', href: '/admin/shares', icon: 'check' },
  { key: 'admin-post-cats', label: '社区分类', href: '/admin/post-categories', icon: 'tag' },
  { key: 'admin-feedback', label: '反馈处理', href: '/admin/feedback', icon: 'mail' },
  { key: 'admin-cats', label: '分类管理', href: '/admin/categories', icon: 'tag' },
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
    ],
  },
  {
    label: '探索学习',
    items: [
      { key: 'explore', label: '诗词探索', href: '/workbench/explore', icon: 'book' },
      { key: 'recite', label: '背诵闯关', href: '/workbench/recite', icon: 'grad' },
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
];

/** 反馈回复类通知：跳转到个人中心的「帮助与反馈」查看 */
const isFeedbackReply = (type: string) => type === 'feedback_reply';

/** 通知类型的中文标签与配色（详情弹窗用） */
const NOTIF_META: Record<string, { label: string; color: string }> = {
  feedback_reply: { label: '反馈回复', color: '#7B8EA1' },
  post_approved: { label: '帖子审核 · 通过', color: '#6B8E7B' },
  post_rejected: { label: '帖子审核 · 未通过', color: '#A67C7C' },
  share_approved: { label: '作品审核 · 通过', color: '#6B8E7B' },
  share_rejected: { label: '作品审核 · 未通过', color: '#A67C7C' },
  share_takedown: { label: '作品已下架', color: '#A67C7C' },
};

/** 通知面板的「系统公告」：展示近期平台能力更新（真实已上线功能，按发布日期倒序） */
const ANNOUNCEMENTS = [
  {
    title: '社区发帖改为先审后发',
    desc: '发帖显示「管理员审批中」，通过后才公开；作者可随时撤回',
    date: '11/16',
    detail:
      '普通用户在「作品社区」发帖后，帖子先进入待审状态，仅自己可见并标注「管理员审批中」；管理员在后台审核通过后，帖子才对全站公开。无论待审还是已通过，作者都可以在自己的帖子列表中点「撤回」，撤回后不再展示。若正文命中敏感词，即使管理员发帖也会送审。',
  },
  {
    title: '帖子板块支持后台自定义',
    desc: '管理端可新增、改名、删除分类；改名自动迁移历史帖子',
    date: '11/16',
    detail:
      '后台「分类管理」已与数据库实时联动，不再是写死的列表。新增分类会立即出现在用户端发帖下拉框；给已有分类改名时，该分类下的历史帖子会一并更新，不会出现分类丢失；仍有帖子占用的分类会被保护，不能误删。用户端每 5 秒自动同步一次分类变化。',
  },
  {
    title: '意象共现重算改为单次查询',
    desc: '后台「意象重算」不再长时间占用连接，大数据量下更稳',
    date: '11/16',
    detail:
      '意象图谱的共现统计由逐条循环改为一条 SQL 相关子查询完成，避免长时间大事务锁表；全库诗词的图谱数据仍按原有口径计算，重算结果与之前一致。管理员可在后台数据维护中手动触发，重算期间前台检索不受影响。',
  },
  {
    title: '管理员总览接入实时待办',
    desc: '待审帖子、待回复反馈、用户与分类统计直接读库',
    date: '11/15',
    detail:
      '后台总览页的指标卡与行内待办全部改为实时接口：待审帖子可直接在总览页通过或驳回，待回复反馈可一键跳转处理，用户管理支持查询、调整角色与停用账号。所有数字均由数据库现场统计，不使用预置数值。',
  },
  {
    title: '研习周报按真实数据出笺',
    desc: '汇总收藏、注解、背诵与创作，自动生成「本周诗笺」并校验格律',
    date: '11/15',
    detail:
      '「研习周报」按自然周聚合你自己的收藏、浏览、注解、背诵与创作记录，给出本周研习诗篇数、四维注解完成率、背诵正确率与意象偏好分布，并据此生成一首「本周诗笺」。生成结果会经过自研格律后校验器复核，页面同时展示校验结论。所有指标均由库表现场计算，不使用演示假数据。',
  },
  {
    title: 'AI 教学课件生成已上线',
    desc: '诗词详情页可一键生成七节结构课件',
    date: '10/13',
    detail:
      '在任意诗词详情页，点击「生成课件」按钮，AI 将自动生成包含「作者背景、字词注释、白话译文、意象分析、艺术手法、情感主旨、拓展思考」七个章节的完整教学课件，可直接用于课堂教学或自主学习。',
  },
  {
    title: '飞花令新增「求提示」',
    desc: '每局 3 次，可参考未用过的含令字诗句',
    date: '10/13',
    detail:
      '飞花令对战中，当你一时想不出含令字的诗句时，可点击「求提示」获取一条尚未使用过的参考诗句（每局限 3 次）。提示仅作启发，不计入你的作答轮次，帮助你在对诗中拓宽思路。',
  },
  {
    title: '朗读增强上线',
    desc: '支持语速与音色设置、逐句高亮跟读',
    date: '10/12',
    detail:
      '诗词朗读功能全面升级：可在朗读设置中选择「豪迈/婉约/苍凉/闲适/童真」等朗读风格，调节 0.5x–2.0x 语速，并指定系统降级音色。朗读时当前诗句高亮显示，支持逐句跟读对比，适合背诵与语感训练。',
  },
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
    case 'check': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5.5" /></svg>;
    case 'mail': return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
    case 'tag': return <svg {...common}><path d="M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" /></svg>;
    default: return null;
  }
}

export function WorkbenchShell({ user, children }: { user: { id: string; name?: string | null; email?: string | null; role?: string; avatar?: string | null }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user.role === 'admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInitSub, setProfileInitSub] = useState<ProfileSub | undefined>(undefined);
  const [dirOpen, setDirOpen] = useState(false);
  const [dark, setDark] = useState(false);

  // 通知面板：系统公告 + 我的通知
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  // 公告详情弹窗
  const [activeAnnounce, setActiveAnnounce] = useState<{ title: string; desc: string; date: string; detail: string } | null>(null);
  // 用户通知
  const [userNotifs, setUserNotifs] = useState<{ id: string; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: string }[]>([]);
  const [unread, setUnread] = useState(0);
  // 通知详情弹窗
  const [activeNotif, setActiveNotif] = useState<{ id: string; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: string } | null>(null);

  // 点击面板外关闭
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // 组件加载 + 每 30s 轮询：拉取用户通知
  async function fetchNotifs() {
    try {
      const r = await fetch('/api/user/notifications', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setUserNotifs(d.items || []);
      setUnread(d.unread || 0);
    } catch { /* 静默 */ }
  }
  useEffect(() => { fetchNotifs(); }, []);
  useEffect(() => {
    const t = setInterval(fetchNotifs, 30000);
    return () => clearInterval(t);
  }, []);

  // 标记已读
  async function markAllRead() {
    try {
      await fetch('/api/user/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
      setUserNotifs((list) => list.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch { /* 静默 */ }
  }
  async function markOneRead(id: string) {
    try {
      await fetch('/api/user/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      setUserNotifs((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch { /* 静默 */ }
  }

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
    <div className="relative isolate min-h-screen" data-theme={dark ? 'dark' : undefined} style={{ background: 'var(--paper)' }}>
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
                onClick={() => { setNotifOpen((v) => !v); if (!notifOpen) fetchNotifs(); }}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-mid transition-ink hover:bg-paper-dark"
                aria-label={`通知${unread > 0 ? ` · ${unread} 条未读` : ''}`}
                aria-expanded={notifOpen}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-[#A67C7C] px-1 font-ui text-[10px] font-medium leading-none text-white" style={{ height: 16 }}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div
                  className="anim-fade-up absolute right-0 top-11 z-50 w-[360px] overflow-hidden rounded-xl border border-light shadow-ink"
                  style={{ background: 'var(--paper-light)' }}
                >
                  <div className="flex items-center justify-between border-b border-light px-4 py-3">
                    <span className="font-ui text-sm font-medium text-ink-deep">通知</span>
                    {unread > 0 && (
                      <button onClick={markAllRead} className="font-ui text-[11px] text-muted-blue transition-ink hover:underline">
                        全部标为已读
                      </button>
                    )}
                  </div>
                  <div className="max-h-[420px] overflow-y-auto">
                    {/* 我的通知 */}
                    <div className="px-4 pb-1 pt-3 font-ui text-[11px] text-ink-soft">我的通知 {unread > 0 && <span className="text-[#A67C7C]">· {unread} 未读</span>}</div>
                    {userNotifs.length === 0 ? (
                      <p className="px-4 py-3 font-ui text-xs text-ink-soft">暂无通知</p>
                    ) : (
                      userNotifs.slice(0, 10).map((n) => (
                        <button
                          key={n.id}
                          onClick={() => { markOneRead(n.id); setActiveNotif(n); }}
                          className="relative w-full px-4 py-2.5 text-left transition-ink hover:bg-paper-dark"
                          style={!n.read ? { background: 'rgba(166,124,124,0.06)' } : undefined}
                        >
                          {!n.read && <span className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full" style={{ background: '#A67C7C' }} />}
                          <div className="ml-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-ui text-[13px] font-medium text-ink-deep">{n.title}</span>
                              <span className="shrink-0 font-ui text-[10px] text-ink-soft">{new Date(n.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="mt-0.5 font-ui text-xs leading-relaxed text-ink-soft line-clamp-2">{n.body}</p>
                          </div>
                        </button>
                      ))
                    )}

                    {/* 系统公告 */}
                    <div className="mt-1 px-4 pb-1 pt-3 font-ui text-[11px] text-ink-soft">系统公告</div>
                    {ANNOUNCEMENTS.map((a) => (
                      <button
                        key={a.title}
                        onClick={() => setActiveAnnounce(a)}
                        className="w-full px-4 py-2.5 text-left transition-ink hover:bg-paper-dark"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-ui text-[13px] font-medium text-ink-deep">{a.title}</span>
                          <span className="shrink-0 font-ui text-[10px] text-ink-soft">{a.date}</span>
                        </div>
                        <p className="mt-0.5 font-ui text-xs leading-relaxed text-ink-soft">{a.desc}</p>
                      </button>
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
          {NAV_TOP.filter((n) => !(isAdmin && n.key === 'dashboard')).map((n) => {
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
          {!isAdmin && NAV_GROUPS.map((g) => (
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
          {isAdmin && (
            <div className="mt-3">
              <div className="mb-1.5 px-3 font-ui text-[11px] tracking-wide text-ink-soft">管理</div>
              <div className="flex flex-col gap-1">
                {ADMIN_NAV.map((n) => {
                  const active = n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href);
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
        initialSub={profileInitSub}
        onClose={() => { setProfileOpen(false); setProfileInitSub(undefined); }}
        user={{ name: user.name || '诗词探索者', email: user.email || '', avatar: user.avatar }}
        onLogout={handleLogout}
      />

      {/* 新手引导 / 定方向：只在工作台首页弹，且两者不叠加——
          全屏遮罩同时出现两层时，点任何按钮都只会关掉最上层，看起来就像「按钮点不开」。 */}
      {pathname === '/workbench' && (
        <>
          {!dirOpen && <Onboarding />}
          <DirectionModal onOpenChange={setDirOpen} />
        </>
      )}

      {/* 系统公告详情弹窗：点击公告项弹出，点击遮罩或关闭按钮消失 */}
      {activeAnnounce && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setActiveAnnounce(null)}
        >
          <div
            className="anim-fade-up w-full max-w-md rounded-2xl border border-light p-6 shadow-ink"
            style={{ background: 'var(--paper-light)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-brush text-lg text-ink-deep">{activeAnnounce.title}</h3>
                <p className="mt-0.5 font-ui text-xs text-ink-soft">发布于 {activeAnnounce.date}</p>
              </div>
              <button
                onClick={() => setActiveAnnounce(null)}
                className="shrink-0 rounded-lg p-1 text-ink-soft transition-ink hover:bg-paper-dark hover:text-ink-deep"
                aria-label="关闭"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
            <p className="mt-4 font-ui text-sm leading-relaxed text-ink-mid">{activeAnnounce.desc}</p>
            <div className="mt-3 rounded-xl bg-paper-dark/60 p-4">
              <p className="font-ui text-[13px] leading-relaxed text-ink-deep">{activeAnnounce.detail}</p>
            </div>
          </div>
        </div>
      )}
      {/* 通知消息详情弹窗：点击通知项弹出，展示完整内容 */}
      {activeNotif && (() => {
        const meta = NOTIF_META[activeNotif.type] || { label: '系统通知', color: '#8B7355' };
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setActiveNotif(null)}
          >
            <div
              className="anim-fade-up w-full max-w-md rounded-2xl border border-light p-6 shadow-ink"
              style={{ background: 'var(--paper-light)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span
                    className="inline-block rounded-full px-2.5 py-0.5 font-ui text-[11px] font-medium"
                    style={{ background: `${meta.color}1a`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <h3 className="mt-2 font-brush text-lg leading-snug text-ink-deep">{activeNotif.title}</h3>
                  <p className="mt-1 font-ui text-xs text-ink-soft">
                    {new Date(activeNotif.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                <button
                  onClick={() => setActiveNotif(null)}
                  className="shrink-0 rounded-lg p-1 text-ink-soft transition-ink hover:bg-paper-dark hover:text-ink-deep"
                  aria-label="关闭"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              </div>

              <div className="mt-4 rounded-xl bg-paper-dark/60 p-4">
                <p className="whitespace-pre-line font-ui text-[13px] leading-relaxed text-ink-deep">{activeNotif.body}</p>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setActiveNotif(null)}
                  className="rounded-lg border border-c px-4 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                >
                  关闭
                </button>
                {isFeedbackReply(activeNotif.type) ? (
                  <button
                    onClick={() => {
                      setActiveNotif(null);
                      setProfileInitSub('help');
                      setProfileOpen(true);
                    }}
                    className="rounded-lg px-4 py-1.5 font-ui text-xs text-white transition-ink"
                    style={{ background: 'var(--btn-bg)' }}
                  >
                    查看我的反馈
                  </button>
                ) : activeNotif.link ? (
                  <button
                    onClick={() => {
                      const link = activeNotif.link;
                      if (!link) return;
                      setActiveNotif(null);
                      router.push(link);
                    }}
                    className="rounded-lg px-4 py-1.5 font-ui text-xs text-white transition-ink"
                    style={{ background: 'var(--btn-bg)' }}
                  >
                    前往查看
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
