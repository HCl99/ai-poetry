'use client';

import { useState } from 'react';
import { authenticate } from '@/app/login/actions';
import { registerUser } from '@/app/register/actions';
import { useToast, Toast } from '@/components/toast';
import { PasswordInput, TEXT_INPUT_CLASS } from '@/components/password-input';

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { msg } = useToast();

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      if (tab === 'login') {
        const err = await authenticate(fd);
        if (err) {
          setError(err);
          setLoading(false);
        }
        // 成功时 signIn 内部 redirect，页面将整体跳转
      } else {
        const res = await registerUser(fd);
        if (res?.error) {
          setError(res.error);
          setLoading(false);
        }
      }
    } catch {
      setError('网络异常，请重试');
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 anim-fade-in"
      style={{ background: 'rgba(60,50,40,0.35)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl anim-scale-in relative"
        style={{ background: '#FAF8F3' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-ink hover:bg-paper-dark hover:text-ink-deep"
          aria-label="关闭"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="px-8 pb-8 pt-10 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full font-brush text-xl text-white shadow-ink" style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}>
            墨
          </div>
          <div className="font-brush text-[28px] leading-tight text-ink-deep">墨韵诗心</div>
          <p className="mt-1 font-ui text-sm text-ink-soft">
            {tab === 'login' ? '登录以继续你的诗词探索之旅' : '注册账号，开启诗词文化探索'}
          </p>
        </div>

        <div className="flex border-b border-light px-8">
          {(['login', 'register'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className={`flex-1 pb-3 font-ui text-[15px] transition-ink ${
                tab === t
                  ? 'border-b-2 border-ink-deep font-medium text-ink-deep'
                  : 'text-ink-soft hover:text-ink-mid'
              }`}
              style={{ borderBottomColor: tab === t ? '#3A3835' : 'transparent', marginBottom: '-1px' }}
            >
              {t === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-8 py-6 font-ui">
          {tab === 'register' && (
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"><UserIcon /></span>
              <input name="name" placeholder="昵称（选填）" className={TEXT_INPUT_CLASS} />
            </div>
          )}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"><MailIcon /></span>
            <input name="email" type="email" required placeholder="邮箱" className={TEXT_INPUT_CLASS} />
          </div>
          <PasswordInput name="password" placeholder="密码" required minLength={6} />
          {tab === 'register' && <PasswordInput name="confirm" placeholder="确认密码" required minLength={6} />}

          {tab === 'login' && (
            <div className="flex justify-end text-sm text-ink-soft">
              <span>忘记密码？请联系管理员重置</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose/10 px-3 py-2 text-center text-sm text-rose-c" style={{ background: 'rgba(166,124,124,0.1)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg font-ui text-[15px] font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:opacity-60"
            style={{ background: '#3A3835' }}
          >
            {loading && <span className="spinner" style={{ width: 16, height: 16 }} />}
            {loading ? (tab === 'login' ? '登录中…' : '注册中…') : tab === 'login' ? '登  录' : '注  册'}
          </button>
        </form>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
