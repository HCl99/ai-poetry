'use client';

import { useState } from 'react';
import { registerUser } from './actions';
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

export function RegisterForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');

  /** 确认密码即时比对：输入即提示，不留到提交后 */
  function checkConfirm(e: React.ChangeEvent<HTMLInputElement>) {
    const form = e.currentTarget.form;
    const pwd = form?.querySelector<HTMLInputElement>('input[name="password"]')?.value || '';
    const c = e.currentTarget.value;
    setConfirmMsg(c && pwd !== c ? '两次输入的密码不一致' : '');
  }

  function validate(e: React.FormEvent<HTMLFormElement>): string {
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') || '');
    const confirm = String(fd.get('confirm') || '');
    if (password !== confirm) return '两次输入的密码不一致';
    if (password.length < 6) return '密码长度至少 6 位';
    return '';
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const pre = validate(e);
    if (pre) {
      setError(pre);
      return;
    }
    setLoading(true);
    try {
      const res = await registerUser(new FormData(e.currentTarget));
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      }
      // 成功时 server action 内部 redirect 到 /workbench
    } catch {
      setError('网络异常，请重试');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-8 pb-6 font-ui">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"><UserIcon /></span>
        <input name="name" placeholder="昵称（选填）" autoComplete="nickname" className={TEXT_INPUT_CLASS} />
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"><MailIcon /></span>
        <input name="email" type="email" required placeholder="邮箱" autoComplete="email" className={TEXT_INPUT_CLASS} />
      </div>
      <PasswordInput name="password" placeholder="密码（至少 6 位）" required minLength={6} autoComplete="new-password" />
      <div>
        <PasswordInput
          name="confirm"
          placeholder="确认密码"
          required
          minLength={6}
          autoComplete="new-password"
          onChange={checkConfirm}
          onBlur={checkConfirm}
        />
        {confirmMsg && (
          <p className="mt-1.5 text-xs" style={{ color: '#A67C7C' }}>{confirmMsg}</p>
        )}
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
        {loading ? '注册中…' : '注  册'}
      </button>
    </form>
  );
}
