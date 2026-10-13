'use client';

import { useEffect, useState } from 'react';
import { authenticate } from './actions';
import { PasswordInput, TEXT_INPUT_CLASS } from '@/components/password-input';
import { WechatLoginButton } from '@/components/wechat-login';
import { FormError } from '@/components/form-error';

const REMEMBER_KEY = 'moyun:remembered-email';

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const [savedEmail, setSavedEmail] = useState('');

  // 记住我：初始化时回填上次记住的邮箱
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setSavedEmail(saved);
        setRemember(true);
      }
    } catch {
      /* localStorage 不可用时静默降级 */
    }
  }, []);

  function toggleRemember() {
    setRemember((v) => !v);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const err = await authenticate(new FormData(e.currentTarget));
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }
      // 登录成功（即将 redirect）：按勾选状态写入/清除记住的邮箱
      try {
        const email = String(new FormData(e.currentTarget).get('email') || '');
        if (remember && email) localStorage.setItem(REMEMBER_KEY, email);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* 忽略存储异常 */
      }
      // 成功时 server action 内部 redirect 到 /workbench，无需前端跳转
    } catch {
      setError('网络异常，请重试');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-8 pb-2 font-ui">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"><MailIcon /></span>
        <input name="email" type="email" required placeholder="邮箱" autoComplete="email" defaultValue={savedEmail} className={TEXT_INPUT_CLASS} />
      </div>
      <PasswordInput name="password" placeholder="密码" required autoComplete="current-password" />

      <div className="flex items-center justify-between text-sm text-ink-soft">
        {/* 记住我：真实实现——勾选后本地记住邮箱，下次自动填充 */}
        <label className="flex cursor-pointer select-none items-center gap-1.5">
          <input type="checkbox" checked={remember} onChange={toggleRemember} className="accent-[#3A3835]" style={{ width: 14, height: 14 }} />
          记住我
        </label>
        <span>忘记密码？请联系管理员重置</span>
      </div>

      <FormError msg={error} />

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg font-ui text-[15px] font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}
      >
        {loading && <span className="spinner" style={{ width: 16, height: 16 }} />}
        {loading ? '登录中…' : '登  录'}
      </button>

      <WechatLoginButton />
    </form>
  );
}
