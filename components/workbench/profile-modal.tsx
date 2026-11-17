'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast, Toast } from '@/components/toast';
import { FEEDBACK_TYPES } from '@/lib/community';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { GOAL_DESC, GOAL_LABEL, GOAL_ORDER, STAGE_DESC, STAGE_LABEL, STAGE_ORDER, type Goal, type Stage } from '@/lib/classics';

export type Sub = 'main' | 'favorites' | 'history' | 'creations' | 'notes' | 'settings' | 'help' | 'logout';

const MENU: { key: Sub; label: string; icon: string; countKey?: string }[] = [
  { key: 'favorites', label: '我的收藏', icon: 'star', countKey: 'favorites' },
  { key: 'history', label: '学习记录', icon: 'clock', countKey: 'history' },
  { key: 'creations', label: '我的创作', icon: 'palette', countKey: 'creations' },
  { key: 'notes', label: '诗词笔记', icon: 'file', countKey: 'notes' },
  { key: 'settings', label: '账户设置', icon: 'settings' },
  { key: 'help', label: '帮助与反馈', icon: 'help' },
];

function Icon({ name }: { name: string }) {
  const c = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'star': return <svg {...c}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
    case 'clock': return <svg {...c}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>;
    case 'palette': return <svg {...c}><circle cx="13.5" cy="6.5" r="1" /><circle cx="17.5" cy="10.5" r="1" /><circle cx="8.5" cy="7.5" r="1" /><circle cx="6.5" cy="12.5" r="1" /><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4a2 2 0 0 1 2-2h2.4A4.6 4.6 0 0 0 22 10.6C22 5.9 17.5 2 12 2z" /></svg>;
    case 'file': return <svg {...c}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
    case 'settings': return <svg {...c}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case 'help': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    case 'logout': return <svg {...c}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
    case 'back': return <svg {...c}><path d="m15 6-6 6 6 6" /></svg>;
    case 'right': return <svg {...c}><path d="m9 6 6 6-6 6" /></svg>;
    default: return null;
  }
}

interface Counts { favorites: number; history: number; creations: number; notes: number }
const EMPTY_COUNTS: Counts = { favorites: 0, history: 0, creations: 0, notes: 0 };

/** /api/user/favorites 返回项 */
interface FavItem { id: string; poemId: string; title: string; author: string; dynasty: string; line: string; time: string }
/** /api/user/history 返回项 */
interface HistItem { id: string; type: string; typeLabel: string; title: string; desc: string; time: string; color: string }
/** /api/user/creations 返回项 */
interface CreationItem { id: string; style: string; input: string; output: string; time: string }
/** /api/user/notes 返回项 */
interface NoteItem { id: string; title: string; content: string; time: string }
/** /api/feedback 返回项 */
interface FeedbackItem { id: string; type: string; content: string; status: string; reply: string | null; createdAt: string }

/** 头像压缩：居中裁剪为 128×128，输出 JPEG DataURL（约 5-15KB） */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('图片处理失败')); return; }
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
}

export function ProfileModal({ open, onClose, user, onLogout, initialSub }: {
  open: boolean;
  onClose: () => void;
  user: { name: string; email: string; avatar?: string | null };
  onLogout: () => void | Promise<void>;
  /** 打开时直接定位到的子页（如从「反馈已回复」通知跳转过来） */
  initialSub?: Sub;
}) {
  const [sub, setSub] = useState<Sub>(initialSub || 'main');
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [favorites, setFavorites] = useState<FavItem[]>([]);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [creations, setCreations] = useState<CreationItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const { msg, show } = useToast();
  const router = useRouter();

  // 每次打开时按 initialSub 定位子页（未指定则回到主页）
  useEffect(() => {
    if (open) setSub(initialSub || 'main');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---- 设置页状态 ---- */
  const [avatar, setAvatar] = useState<string | null>(user.avatar || null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [stage, setStage] = useState<Stage>('junior');
  const [goal, setGoal] = useState<Goal>('exam');
  const [savingStage, setSavingStage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ---- 反馈页状态 ---- */
  const [fbType, setFbType] = useState('');
  const [fbContent, setFbContent] = useState('');
  const [fbContact, setFbContact] = useState('');
  const [fbSending, setFbSending] = useState(false);
  const [fbItems, setFbItems] = useState<FeedbackItem[] | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      const r = await fetch('/api/user/summary');
      if (r.ok) setCounts(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) {
      setSub('main');
      loadCounts();
      setAvatar(user.avatar || null);
      setName(user.name);
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
      setFbType(''); setFbContent(''); setFbContact(''); setFbItems(null);
      fetch('/api/user/stage')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.stage) { setStage(d.stage as Stage); setGoal((d.goal as Goal) ?? 'exam'); } })
        .catch(() => {});
    }
  }, [open, loadCounts, user.avatar, user.name]);

  /** 保存学段/方向：背诵闯关与诗词测验据此选择题源、难度与默认题型 */
  async function saveStage(next?: Stage, nextGoal?: Goal) {
    if (savingStage) return;
    if (next && next === stage) return;
    if (nextGoal && nextGoal === goal) return;
    setSavingStage(true);
    try {
      const r = await fetch('/api/user/stage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: next ?? stage, goal: nextGoal ?? goal }),
      });
      const d = await r.json();
      if (!r.ok) { show(d.error || '保存失败'); return; }
      if (next) setStage(next);
      if (nextGoal) setGoal(nextGoal);
      show(next
        ? `已切换为${STAGE_LABEL[next]}学段，闯关与测验将按该学段出题`
        : `已切换为「${GOAL_LABEL[nextGoal!]}」方向`);
    } finally {
      setSavingStage(false);
    }
  }

  /* ---- 设置页：头像压缩上传（128×128 JPEG DataURL） ---- */
  function pickAvatar() { fileRef.current?.click(); }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) { show('仅支持 PNG / JPG / WebP 图片'); return; }
    try {
      setAvatarSaving(true);
      const dataUrl = await compressImage(file);
      const r = await fetch('/api/user/avatar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar: dataUrl }) });
      const d = await r.json();
      if (!r.ok) { show(d.error || '上传失败'); return; }
      setAvatar(dataUrl);
      show('头像已更新');
      router.refresh();
    } catch (err) {
      show(err instanceof Error ? err.message : '图片处理失败');
    } finally {
      setAvatarSaving(false);
    }
  }

  async function removeAvatar() {
    const r = await fetch('/api/user/avatar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar: null }) });
    if (r.ok) { setAvatar(null); show('已恢复默认头像'); router.refresh(); }
  }

  /* ---- 设置页：昵称保存 ---- */
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 20) { show('昵称需为 1-20 个字符'); return; }
    setSavingName(true);
    try {
      const r = await fetch('/api/user/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) });
      const d = await r.json();
      if (!r.ok) { show(d.error || '保存失败'); return; }
      show('昵称已保存');
      router.refresh();
    } finally {
      setSavingName(false);
    }
  }

  /* ---- 设置页：修改密码 ---- */
  const pwdMismatch = confirmPwd.length > 0 && newPwd !== confirmPwd;
  const pwdInvalid = newPwd.length > 0 && (newPwd.length < 6 || newPwd.length > 32);

  async function changePwd(e: React.FormEvent) {
    e.preventDefault();
    if (!oldPwd) { show('请输入旧密码'); return; }
    if (pwdInvalid) { show('新密码长度需为 6-32 位'); return; }
    if (newPwd !== confirmPwd) { show('两次输入的新密码不一致'); return; }
    setSavingPwd(true);
    try {
      const r = await fetch('/api/user/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }) });
      const d = await r.json();
      if (!r.ok) { show(d.error || '修改失败'); return; }
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
      if (d.reLogin) {
        // 改密后旧会话已被服务端作废，主动登出并引导重新登录
        show('密码修改成功，请重新登录');
        await fetch('/api/auth/logout', { method: 'POST' });
        setTimeout(() => router.push('/login'), 900);
        return;
      }
      show('密码修改成功');
    } finally {
      setSavingPwd(false);
    }
  }

  /* ---- 反馈页 ---- */
  async function loadFeedback() {
    try {
      const r = await fetch('/api/feedback', { cache: 'no-store' });
      if (r.ok) setFbItems((await r.json()).items);
    } catch { /* ignore */ }
  }

  // 只有打开「帮助与反馈」时才轮询：管理员在后台回复 / 重新打开后，这里自动更新
  useAutoRefresh(
    () => { if (open && sub === 'help') return loadFeedback(); },
    open && sub === 'help' ? 10000 : 0,
  );

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!fbType) { show('请选择反馈类型'); return; }
    const text = fbContent.trim();
    if (text.length < 5 || text.length > 500) { show('反馈内容需为 5-500 字'); return; }
    setFbSending(true);
    try {
      const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: fbType, content: text, contact: fbContact.trim() || undefined }) });
      const d = await r.json();
      if (!r.ok) { show(d.error || '提交失败'); return; }
      show('反馈已提交，感谢你的建议！');
      setFbType(''); setFbContent(''); setFbContact('');
      loadFeedback();
    } finally {
      setFbSending(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    if (sub === 'favorites' && !favorites.length) fetch('/api/user/favorites').then((r) => r.ok ? r.json() : []).then(setFavorites).catch(() => {});
    if (sub === 'history' && !history.length) fetch('/api/user/history').then((r) => r.ok ? r.json() : []).then(setHistory).catch(() => {});
    if (sub === 'creations' && !creations.length) fetch('/api/user/creations').then((r) => r.ok ? r.json() : []).then(setCreations).catch(() => {});
    if (sub === 'notes' && !notes.length) fetch('/api/user/notes').then((r) => r.ok ? r.json() : []).then(setNotes).catch(() => {});
    if (sub === 'help' && fbItems === null) loadFeedback();
  }, [sub, open, favorites.length, history.length, creations.length, notes.length, fbItems]);

  if (!open) return null;

  const DYN: Record<string, string> = { 唐: 'dynasty-tang', 宋: 'dynasty-song', 元: 'dynasty-yuan', 明清: 'dynasty-mingqing' };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 anim-fade-in" style={{ background: 'rgba(60,50,40,0.4)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="anim-scale-in flex max-h-[80vh] w-full max-w-[480px] flex-col overflow-hidden rounded-xl" style={{ background: 'var(--paper-light)' }} onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-light px-6 py-4">
          {sub !== 'main' ? (
            <button onClick={() => setSub('main')} className="flex items-center gap-1.5 font-ui text-sm text-ink-soft transition-ink hover:text-ink-deep">
              <Icon name="back" /> 返回
            </button>
          ) : (
            <span className="font-ui text-[15px] font-medium text-ink-deep">个人中心</span>
          )}
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-ink hover:bg-paper-dark" aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* 本地选图 input 常驻：个人中心主视图与设置页共用同一上传逻辑 */}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarFile} />

        <div className="overflow-y-auto">
          {/* 用户信息头（主列表） */}
          {sub === 'main' && (
            <>
              <div className="flex items-center gap-3 border-b border-light px-6 py-5">
                {/* 头像即上传入口：点击调起本地文件选择，悬停显示「更换」 */}
                <button
                  type="button"
                  onClick={pickAvatar}
                  disabled={avatarSaving}
                  title="点击从本地电脑选择图片更换头像"
                  aria-label="更换头像"
                  className="group relative h-11 w-11 shrink-0 rounded-full transition-ink hover:shadow-ink focus:outline-none"
                >
                  {avatar ? (
                    <img src={avatar} alt="头像" className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full font-brush text-lg text-white" style={{ background: 'var(--brand-grad)' }}>
                      {user.name[0]}
                    </span>
                  )}
                  <span
                    className="absolute inset-0 flex items-center justify-center rounded-full font-ui text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-100"
                    style={{ background: 'rgba(40,36,32,0.55)' }}
                  >
                    {avatarSaving ? '上传中' : '更换'}
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-paper-light" style={{ background: '#6B8E7B' }} />
                </button>
                <div>
                  <div className="font-ui text-[15px] font-medium text-ink-deep">{user.name}</div>
                  <div className="font-ui text-xs text-ink-soft">{user.email}</div>
                </div>
              </div>
              <div className="px-3 py-3">
                {MENU.map((m) => (
                  <button key={m.key} onClick={() => setSub(m.key)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-ink hover:bg-paper-dark">
                    <span className="text-ink-mid"><Icon name={m.icon} /></span>
                    <span className="flex-1 font-ui text-sm text-ink-deep">{m.label}</span>
                    {m.countKey && <span className="font-ui text-xs text-ink-soft">{counts[m.countKey as keyof Counts]}{m.key === 'favorites' ? '首' : m.key === 'creations' ? '条' : m.key === 'notes' ? '篇' : '条'}</span>}
                    <span className="text-ink-soft"><Icon name="right" /></span>
                  </button>
                ))}
              </div>
              <div className="border-t border-light p-3">
                <button onClick={() => setSub('logout')} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-ink hover:bg-paper-dark">
                  <span style={{ color: '#A67C7C' }}><Icon name="logout" /></span>
                  <span className="flex-1 font-ui text-sm" style={{ color: '#A67C7C' }}>退出登录</span>
                </button>
              </div>
            </>
          )}

          {/* 收藏 */}
          {sub === 'favorites' && (
            <div className="space-y-3 p-5">
              {favorites.length === 0 && <p className="py-10 text-center font-ui text-sm text-ink-soft">还没有收藏诗词，去诗词探索页发现美吧</p>}
              {favorites.map((f) => (
                <div key={f.id} className="rounded-lg p-4" style={{ background: 'var(--inset)' }}>
                  <div className="flex items-center gap-2">
                    <span className={`dynasty-tag ${DYN[f.dynasty] || 'dynasty-tang'}`}>{f.dynasty || '唐'}</span>
                    <span className="font-brush text-lg text-ink-deep">{f.title}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 font-serif text-sm leading-relaxed text-ink-mid">{f.line}</p>
                  <p className="mt-1 font-ui text-xs text-ink-soft">收藏于 {f.time}</p>
                </div>
              ))}
            </div>
          )}

          {/* 学习记录 */}
          {sub === 'history' && (
            <div className="p-5">
              {history.length === 0 && <p className="py-10 text-center font-ui text-sm text-ink-soft">暂无学习记录</p>}
              <div className="relative space-y-5 pl-5">
                <span className="absolute left-[7px] top-1 h-[calc(100%-8px)] w-px" style={{ background: 'var(--border-light)' }} />
                {history.map((h) => (
                  <div key={h.id} className="relative">
                    <span className="absolute -left-5 top-1 h-3.5 w-3.5 rounded-full border-2 border-paper-light" style={{ background: h.color || '#6B8E7B' }} />
                    <div className="font-ui text-sm text-ink-deep">{h.title}</div>
                    <p className="mt-0.5 font-ui text-xs text-ink-soft">{h.desc}</p>
                    <p className="mt-0.5 font-ui text-xs text-ink-soft">{h.time}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 我的创作 */}
          {sub === 'creations' && (
            <div className="space-y-3 p-5">
              {creations.length === 0 && <p className="py-10 text-center font-ui text-sm text-ink-soft">还没有创作，去风格迁移页试试吧</p>}
              {creations.map((c) => (
                <div key={c.id} className="rounded-lg p-4" style={{ background: 'var(--inset)' }}>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full px-2.5 py-0.5 font-ui text-xs" style={{ background: 'rgba(107,142,123,0.15)', color: '#6B8E7B' }}>{c.style}</span>
                    <span className="font-ui text-xs text-ink-soft">{c.time}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-line font-serif text-[15px] leading-loose text-ink-deep">{c.output}</p>
                  <p className="mt-2 line-clamp-1 font-ui text-xs text-ink-soft">灵感：{c.input}</p>
                </div>
              ))}
            </div>
          )}

          {/* 诗词笔记 */}
          {sub === 'notes' && (
            <div className="space-y-3 p-5">
              {notes.length === 0 && <p className="py-10 text-center font-ui text-sm text-ink-soft">暂无笔记，可在注解页保存心得</p>}
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg p-4" style={{ background: 'var(--inset)' }}>
                  <div className="font-ui text-sm font-medium text-ink-deep">{n.title}</div>
                  <p className="mt-1 line-clamp-3 font-ui text-sm leading-relaxed text-ink-mid">{n.content}</p>
                  <p className="mt-1.5 font-ui text-xs text-ink-soft">{n.time}</p>
                </div>
              ))}
            </div>
          )}

          {/* 设置：头像 / 昵称 / 修改密码 */}
          {sub === 'settings' && (
            <div className="space-y-6 p-5 font-ui">
              {/* 头像 */}
              <section>
                <h4 className="mb-2 text-sm font-medium text-ink-deep">头像</h4>
                <div className="flex items-center gap-4">
                  {avatar ? (
                    <img src={avatar} alt="头像" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-full font-brush text-xl text-white" style={{ background: 'var(--brand-grad)' }}>
                      {user.name[0]}
                    </span>
                  )}
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button onClick={pickAvatar} className="rounded-lg border-[1.5px] border-c px-3 py-1.5 text-xs text-ink-mid transition-ink hover:bg-paper-dark">上传新头像</button>
                      {avatar && (
                        <button onClick={removeAvatar} className="rounded-lg px-3 py-1.5 text-xs transition-ink" style={{ background: 'rgba(166,124,124,0.1)', color: '#A67C7C' }}>恢复默认</button>
                      )}
                    </div>
                    <span className="text-xs text-ink-soft">支持 JPG / PNG / WebP，自动裁剪为圆形 128×128</span>
                  </div>
                </div>
              </section>

              {/* 昵称 */}
              <section>
                <h4 className="mb-2 text-sm font-medium text-ink-deep">昵称</h4>
                <form className="flex gap-2" onSubmit={saveName}>
                  <input
                    value={name || ''}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={20}
                    placeholder="给自己起个雅号吧"
                    className="h-10 flex-1 rounded-lg border-[1.5px] border-c bg-white/60 px-3 text-sm outline-none transition-ink focus:border-ink-deep"
                  />
                  <button type="submit" disabled={savingName} className="h-10 rounded-lg px-4 text-sm font-medium transition-ink hover:-translate-y-0.5 disabled:opacity-50" style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}>
                    {savingName ? '保存中…' : '保存'}
                  </button>
                </form>
                <p className="mt-1.5 text-xs text-ink-soft">邮箱 {user.email} 不可更改</p>
              </section>

              {/* 学段：决定闯关/测验题源 */}
              <section>
                <h4 className="mb-2 text-sm font-medium text-ink-deep">学段与方向</h4>
                <div className="grid grid-cols-5 gap-2">
                  {STAGE_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={savingStage}
                      onClick={() => saveStage(s)}
                      className="rounded-lg border-[1.5px] px-1 py-2 text-xs transition-ink disabled:opacity-60"
                      style={stage === s
                        ? { borderColor: 'var(--btn-bg)', background: 'var(--btn-bg)', color: 'var(--btn-text)' }
                        : { borderColor: 'var(--border-mid, #D8D2C6)', color: 'var(--ink-mid)' }}
                    >
                      {STAGE_LABEL[s]}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{STAGE_DESC[stage]}。切换后背诵闯关与诗词测验只出该学段的必背篇目，测验默认难度也随之调整。</p>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {GOAL_ORDER.map((g) => (
                    <button
                      key={g}
                      type="button"
                      disabled={savingStage}
                      onClick={() => saveStage(undefined, g)}
                      className="rounded-lg border-[1.5px] px-1 py-2 text-xs transition-ink disabled:opacity-60"
                      style={goal === g
                        ? { borderColor: 'var(--btn-bg)', background: 'var(--btn-bg)', color: 'var(--btn-text)' }
                        : { borderColor: 'var(--border-mid, #D8D2C6)', color: 'var(--ink-mid)' }}
                    >
                      {GOAL_LABEL[g]}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{GOAL_DESC[goal]}</p>
              </section>

              {/* 修改密码 */}
              <section>
                <h4 className="mb-2 text-sm font-medium text-ink-deep">修改密码</h4>
                <form className="space-y-3" onSubmit={changePwd}>
                  <input
                    type="password"
                    value={oldPwd}
                    onChange={(e) => setOldPwd(e.target.value)}
                    placeholder="当前密码"
                    autoComplete="current-password"
                    className="h-10 w-full rounded-lg border-[1.5px] border-c bg-white/60 px-3 text-sm outline-none transition-ink focus:border-ink-deep"
                  />
                  <div>
                    <input
                      type="password"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      placeholder="新密码（6-32 位）"
                      autoComplete="new-password"
                      className={`h-10 w-full rounded-lg border-[1.5px] bg-white/60 px-3 text-sm outline-none transition-ink ${pwdInvalid ? 'border-[#A67C7C]' : 'border-c focus:border-ink-deep'}`}
                    />
                    {pwdInvalid && <p className="mt-1 text-xs" style={{ color: '#A67C7C' }}>新密码长度需为 6-32 位</p>}
                  </div>
                  <div>
                    <input
                      type="password"
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      placeholder="确认新密码"
                      autoComplete="new-password"
                      className={`h-10 w-full rounded-lg border-[1.5px] bg-white/60 px-3 text-sm outline-none transition-ink ${pwdMismatch ? 'border-[#A67C7C]' : 'border-c focus:border-ink-deep'}`}
                    />
                    {pwdMismatch && <p className="mt-1 text-xs" style={{ color: '#A67C7C' }}>两次输入的密码不一致</p>}
                  </div>
                  <button type="submit" disabled={savingPwd || pwdInvalid || pwdMismatch || !oldPwd || !newPwd} className="h-10 w-full rounded-lg text-sm font-medium transition-ink hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}>
                    {savingPwd ? '提交中…' : '确认修改'}
                  </button>
                </form>
              </section>

            </div>
          )}

          {/* 帮助与反馈 */}
          {sub === 'help' && (
            <div className="space-y-6 p-5">
              <div className="space-y-2">
                {[
                  { q: 'AI注解是如何生成的？', a: '先以本地 BGE 中文向量模型将诗词编码为 512 维语义向量，在 16.7 万首诗的向量库中检索最相似的诗篇，连同诗人小传作为上下文，再由大模型生成字词释义、典故溯源、情感分析、格律分析四维度注解，每条均标注引用出处与相似度。' },
                  { q: '风格迁移支持哪些诗人风格？', a: '目前支持李白体、苏轼体、婉约体、王维体、杜甫体五种风格，AI 会先向量检索该诗人的语义相近原作作为范例，再模仿其风格生成诗词。' },
                  { q: '诗词数据来源是什么？', a: '基于GitHub开源项目chinese-poetry，收录约34万首唐宋诗词，公有领域零版权风险。' },
                  { q: '如何收藏诗词？', a: '在诗词探索或注解页面点击收藏按钮，即可在「我的收藏」中查看。' },
                  { q: '遇到内容问题怎么办？', a: 'AI 生成内容仅供参考，如发现注解有误或内容不当，可在下方提交「内容纠错」反馈，管理员会尽快核实处理。' },
                ].map((f, i) => (
                  <details key={i} className="rounded-lg px-4 py-3" style={{ background: 'var(--inset)' }}>
                    <summary className="cursor-pointer font-ui text-sm text-ink-deep">{f.q}</summary>
                    <p className="mt-2 font-ui text-sm leading-relaxed text-ink-mid">{f.a}</p>
                  </details>
                ))}
              </div>

              {/* 提交反馈 */}
              <div>
                <h4 className="mb-3 font-ui text-sm font-medium text-ink-deep">意见反馈</h4>
                <form className="space-y-3 font-ui" onSubmit={submitFeedback}>
                  <div className="flex flex-wrap gap-2">
                    {FEEDBACK_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFbType(t)}
                        className="rounded-full px-3 py-1.5 text-xs transition-ink"
                        style={fbType === t ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' } : { background: 'var(--inset)', color: 'var(--ink-mid)' }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div>
                    <textarea
                      value={fbContent}
                      onChange={(e) => setFbContent(e.target.value)}
                      rows={4}
                      maxLength={500}
                      placeholder="请描述你遇到的问题或建议（5-500 字）…"
                      className="w-full rounded-lg border-[1.5px] border-c bg-white/60 p-3 text-sm outline-none transition-ink focus:border-ink-deep"
                    />
                    <p className="mt-1 text-right text-xs text-ink-soft">{fbContent.length}/500</p>
                  </div>
                  <input
                    value={fbContact}
                    onChange={(e) => setFbContact(e.target.value)}
                    maxLength={64}
                    placeholder="联系方式（选填，便于回访）"
                    className="h-10 w-full rounded-lg border-[1.5px] border-c bg-white/60 px-3 text-sm outline-none transition-ink focus:border-ink-deep"
                  />
                  <button type="submit" disabled={fbSending} className="h-10 w-full rounded-lg text-sm font-medium transition-ink hover:-translate-y-0.5 disabled:opacity-50" style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}>
                    {fbSending ? '提交中…' : '提交反馈'}
                  </button>
                </form>
              </div>

              {/* 我的反馈 */}
              {fbItems !== null && (
                <div>
                  <h4 className="mb-3 font-ui text-sm font-medium text-ink-deep">我的反馈</h4>
                  {fbItems.length === 0 ? (
                    <p className="py-4 text-center font-ui text-xs text-ink-soft">暂无反馈记录</p>
                  ) : (
                    <div className="space-y-2">
                      {fbItems.map((f) => (
                        <div key={f.id} className="rounded-lg p-3 font-ui" style={{ background: 'var(--inset)' }}>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'rgba(107,142,123,0.15)', color: '#6B8E7B' }}>{f.type}</span>
                            <span className="rounded-full px-2 py-0.5 text-[10px]" style={f.status === 'resolved' ? { background: 'rgba(107,142,123,0.2)', color: '#4F7A5F' } : { background: 'rgba(166,140,90,0.15)', color: '#A67C50' }}>
                              {f.status === 'resolved' ? '已回复' : '待处理'}
                            </span>
                            <span className="ml-auto text-[10px] text-ink-soft">{new Date(f.createdAt).toLocaleDateString('zh-CN')}</span>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-sm text-ink-mid">{f.content}</p>
                          {f.reply && (
                            <p className="mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed" style={{ background: 'rgba(107,142,123,0.08)', color: '#4F7A5F' }}>
                              管理员回复：{f.reply}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 退出确认 */}
          {sub === 'logout' && (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(166,124,124,0.12)', color: '#A67C7C' }}><Icon name="logout" /></span>
              <h3 className="mt-4 font-ui text-lg font-medium text-ink-deep">确定要退出登录吗？</h3>
              <p className="mt-1.5 font-ui text-sm text-ink-soft">你的学习记录与收藏会保留在账号中</p>
              <div className="mt-8 flex w-full gap-3">
                <button onClick={() => setSub('main')} className="h-11 flex-1 rounded-lg border-[1.5px] border-c font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark">再逛逛</button>
                <button onClick={() => { onLogout(); }} className="h-11 flex-1 rounded-lg font-ui text-sm font-medium transition-ink hover:-translate-y-0.5" style={{ background: '#A67C7C', color: '#FAF8F3' }}>确认退出</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
