'use client';

import { useState } from 'react';
import Link from 'next/link';
import { resetPassword } from './actions';
import { PasswordInput, TEXT_INPUT_CLASS, INPUT_ICON_CLASS } from '@/components/password-input';
import { FormError, shakeAuthCard } from '@/components/form-error';
import { EmailCodeField } from '@/components/email-code-field';

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

export function ForgotForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    if (String(fd.get('password') || '') !== String(fd.get('confirm') || '')) {
      setError('两次输入的密码不一致');
      shakeAuthCard();
      return;
    }
    setLoading(true);
    try {
      const res = await resetPassword(fd);
      if (res?.error) {
        setError(res.error);
        shakeAuthCard();
        setLoading(false);
        return;
      }
      setDone(true);
      setLoading(false);
    } catch {
      setError('网络异常，请重试');
      shakeAuthCard();
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="px-8 pb-12 pt-4 text-center font-ui">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ background: '#6B8E7B' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 12 5 5L20 7" />
          </svg>
        </div>
        <p className="text-[15px] text-ink-deep">密码已重置</p>
        <p className="mt-1.5 text-sm text-ink-soft">请使用新密码登录</p>
        <Link
          href="/login"
          className="mt-6 flex h-11 w-full items-center justify-center rounded-lg text-[15px] font-medium text-white transition-ink hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}
        >
          去登录
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-8 pb-6 font-ui">
      <div className="group relative">
        <span className={INPUT_ICON_CLASS}><MailIcon /></span>
        <input
          name="email"
          type="email"
          required
          placeholder="注册时使用的邮箱"
          autoComplete="email"
          onChange={(e) => setEmail(e.currentTarget.value)}
          className={TEXT_INPUT_CLASS}
        />
      </div>

      <EmailCodeField email={email} purpose="reset" />

      <PasswordInput name="password" placeholder="新密码（至少 6 位）" required minLength={6} autoComplete="new-password" />
      <PasswordInput name="confirm" placeholder="确认新密码" required minLength={6} autoComplete="new-password" />

      <FormError msg={error} />

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg font-ui text-[15px] font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}
      >
        {loading && <span className="spinner" style={{ width: 16, height: 16 }} />}
        {loading ? '重置中…' : '重置密码'}
      </button>
    </form>
  );
}
