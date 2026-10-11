'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast, Toast } from '@/components/toast';

type Sub = 'main' | 'favorites' | 'history' | 'creations' | 'notes' | 'settings' | 'help' | 'logout';

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

export function ProfileModal({ open, onClose, user, onLogout }: {
  open: boolean;
  onClose: () => void;
  user: { name: string; email: string };
  onLogout: () => void | Promise<void>;
}) {
  const [sub, setSub] = useState<Sub>('main');
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [creations, setCreations] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const { msg, show } = useToast();

  const loadCounts = useCallback(async () => {
    try {
      const r = await fetch('/api/user/summary');
      if (r.ok) setCounts(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) { setSub('main'); loadCounts(); }
  }, [open, loadCounts]);

  useEffect(() => {
    if (!open) return;
    if (sub === 'favorites' && !favorites.length) fetch('/api/user/favorites').then((r) => r.ok ? r.json() : []).then(setFavorites).catch(() => {});
    if (sub === 'history' && !history.length) fetch('/api/user/history').then((r) => r.ok ? r.json() : []).then(setHistory).catch(() => {});
    if (sub === 'creations' && !creations.length) fetch('/api/user/creations').then((r) => r.ok ? r.json() : []).then(setCreations).catch(() => {});
    if (sub === 'notes' && !notes.length) fetch('/api/user/notes').then((r) => r.ok ? r.json() : []).then(setNotes).catch(() => {});
  }, [sub, open, favorites.length, history.length, creations.length, notes.length]);

  if (!open) return null;

  const DYN: Record<string, string> = { 唐: 'dynasty-tang', 宋: 'dynasty-song', 元: 'dynasty-yuan', 明清: 'dynasty-mingqing' };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 anim-fade-in" style={{ background: 'rgba(60,50,40,0.4)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="anim-scale-in flex max-h-[80vh] w-full max-w-[480px] flex-col overflow-hidden rounded-xl" style={{ background: '#FAF8F3' }} onClick={(e) => e.stopPropagation()}>
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

        <div className="overflow-y-auto">
          {/* 用户信息头（主列表） */}
          {sub === 'main' && (
            <>
              <div className="flex items-center gap-3 border-b border-light px-6 py-5">
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full font-brush text-lg text-white" style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}>
                  {user.name[0]}
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-paper-light" style={{ background: '#6B8E7B' }} />
                </span>
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
              {favorites.map((f: any) => (
                <div key={f.id} className="rounded-lg p-4" style={{ background: '#F5F2EC' }}>
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
                <span className="absolute left-[7px] top-1 h-[calc(100%-8px)] w-px" style={{ background: '#E5DFD4' }} />
                {history.map((h: any) => (
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
              {creations.map((c: any) => (
                <div key={c.id} className="rounded-lg p-4" style={{ background: '#F5F2EC' }}>
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
              {notes.map((n: any) => (
                <div key={n.id} className="rounded-lg p-4" style={{ background: '#F5F2EC' }}>
                  <div className="font-ui text-sm font-medium text-ink-deep">{n.title}</div>
                  <p className="mt-1 line-clamp-3 font-ui text-sm leading-relaxed text-ink-mid">{n.content}</p>
                  <p className="mt-1.5 font-ui text-xs text-ink-soft">{n.time}</p>
                </div>
              ))}
            </div>
          )}

          {/* 设置 */}
          {sub === 'settings' && (
            <form className="space-y-4 p-5 font-ui" onSubmit={(e) => { e.preventDefault(); show('设置已保存'); setTimeout(onClose, 800); }}>
              {[
                { label: '昵称', value: user.name },
                { label: '邮箱', value: user.email },
                { label: '偏好朝代', value: '唐' },
                { label: 'AI注解详细程度', value: '标准' },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mb-1.5 block text-sm text-ink-mid">{f.label}</label>
                  <input defaultValue={f.value} className="h-10 w-full rounded-lg border-[1.5px] border-c bg-white/60 px-3 text-sm outline-none transition-ink focus:border-ink-deep" />
                </div>
              ))}
              <button type="submit" className="h-10 w-full rounded-lg font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5" style={{ background: '#3A3835' }}>保存设置</button>
            </form>
          )}

          {/* 帮助 */}
          {sub === 'help' && (
            <div className="space-y-2 p-5">
              {[
                { q: 'AI注解是如何生成的？', a: '先检索同意象诗篇与诗人小传作为上下文，再由大模型生成字词释义、典故溯源、情感分析、格律分析四维度注解，每条均标注引用出处。' },
                { q: '风格迁移支持哪些诗人风格？', a: '目前支持李白体、苏轼体、婉约体、王维体、杜甫体五种风格，AI 会分析语义、提炼意象，再模仿对应诗人风格生成诗词。' },
                { q: '诗词数据来源是什么？', a: '基于GitHub开源项目chinese-poetry，收录约5.5万首唐宋诗词，公有领域零版权风险。' },
                { q: '如何收藏诗词？', a: '在诗词探索或注解页面点击收藏按钮，即可在「我的收藏」中查看。' },
                { q: '遇到内容问题怎么办？', a: 'AI 生成内容仅供参考，如发现注解有误或内容不当，可重新生成或通过邮箱联系我们。' },
              ].map((f, i) => (
                <details key={i} className="rounded-lg px-4 py-3" style={{ background: '#F5F2EC' }}>
                  <summary className="cursor-pointer font-ui text-sm text-ink-deep">{f.q}</summary>
                  <p className="mt-2 font-ui text-sm leading-relaxed text-ink-mid">{f.a}</p>
                </details>
              ))}
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
