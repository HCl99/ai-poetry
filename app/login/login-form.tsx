'use client';

import { useState } from 'react';
import { authenticate } from './actions';
import { PasswordInput, TEXT_INPUT_CLASS } from '@/components/password-input';

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const err = await authenticate(new FormData(e.currentTarget));
      if (err) {
        setError(err);
        setLoading(false);
      }
      // 成功时 server action 内部 redirect 到 /workbench，无需前端跳转
    } catch {
      setError('网络异常，请重试');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-8 pb-6 font-ui">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"><MailIcon /></span>
        <input name="email" type="email" required placeholder="邮箱" autoComplete="email" className={TEXT_INPUT_CLASS} />
      </div>
      <PasswordInput name="password" placeholder="密码" required autoComplete="current-password" />

      <div className="flex justify-end text-sm text-ink-soft">
        <span>忘记密码？请联系管理员重置</span>
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-center text-sm" style={{ background: 'rgba(166,124,124,0.1)', color: '#A67C7C' }}>
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
        {loading ? '登录中…' : '登  录'}
      </button>
    </form>
  );
}
