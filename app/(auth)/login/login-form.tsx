'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authenticate } from './actions';
import { PasswordInput, TEXT_INPUT_CLASS, INPUT_ICON_CLASS, INVALID_STYLE } from '@/components/password-input';
import { FormError, shakeAuthCard } from '@/components/form-error';

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
  const [success, setSuccess] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [invalid, setInvalid] = useState(false);
  const router = useRouter();

  /** 账号即时校验：只在输入含 @ 时按邮箱格式提示，纯用户名不校验 */
  function checkAccount(v: string) {
    const t = v.trim();
    setEmailMsg(t.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? '邮箱格式似乎不正确' : '');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    // 提前抓取表单值：React 合成事件的 currentTarget 在 await 之后会被置空
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const err = await authenticate(fd);
      if (err) {
        setError(err);
        setInvalid(true);
        shakeAuthCard();
        setLoading(false);
        return;
      }
      setLoading(false);
      setSuccess(true);
      // signIn 成功后 NextAuth 会写 session cookie，短暂等待 cookie 生效
      setTimeout(async () => {
        try {
          const r = await fetch('/api/auth/session', { credentials: 'include' });
          const s = await r.json();
          if (s?.user?.role === 'admin') router.push('/admin');
          else router.push('/home');
        } catch {
          router.push('/home');
        }
      }, 700);
    } catch {
      setError('网络异常，请重试');
      shakeAuthCard();
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-8 pb-8 font-ui">
      <div>
        <label htmlFor="account" className="mb-1 block font-ui text-xs text-ink-soft">
          账号（邮箱/用户名）
        </label>
        <div className="group relative">
          <span className={INPUT_ICON_CLASS}><MailIcon /></span>
          <input
            id="account"
            name="account"
            type="text"
            required
            placeholder="请输入邮箱或用户名"
            autoComplete="username"
            onBlur={(e) => checkAccount(e.currentTarget.value)}
            onChange={(e) => {
              setInvalid(false);
              if (emailMsg) checkAccount(e.currentTarget.value);
            }}
            aria-invalid={invalid || undefined}
            className={TEXT_INPUT_CLASS}
            style={invalid ? INVALID_STYLE : undefined}
          />
        </div>
        {emailMsg && <p className="mt-1.5 text-xs" style={{ color: '#A67C7C' }}>{emailMsg}</p>}
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block font-ui text-xs text-ink-soft">
          密码
        </label>
        <PasswordInput
          id="password"
          name="password"
          placeholder="请输入密码"
          required
          autoComplete="current-password"
          invalid={invalid}
          onChange={() => setInvalid(false)}
        />
      </div>

      {/* 辅助链接：忘记密码紧跟密码框，符合「输入→辅助→主操作」的阅读顺序 */}
      <div className="flex justify-end text-sm text-ink-soft">
        <Link href="/forgot" className="text-muted-blue transition-ink hover:underline">
          忘记密码？
        </Link>
      </div>

      <FormError msg={error} />

      <button
        type="submit"
        disabled={loading || success}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg font-ui text-[15px] font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:opacity-70"
        style={{ background: success ? 'linear-gradient(135deg,#6B8E7B,#527A66)' : 'linear-gradient(135deg,#3A3835,#5D5853)' }}
      >
        {loading && !success && <span className="spinner" style={{ width: 16, height: 16 }} />}
        {success ? '✓ 正在进入诗境…' : loading ? '登录中…' : '登  录'}
      </button>

      <p className="text-center font-ui text-[11px] leading-relaxed text-ink-soft">
        登录即表示同意{' '}
        <Link href="/legal/terms" className="text-muted-blue transition-ink hover:underline">《用户协议》</Link>
        {' '}与{' '}
        <Link href="/legal/privacy" className="text-muted-blue transition-ink hover:underline">《隐私政策》</Link>
      </p>

      {/* 注册引导放在主操作之后，作为页面收尾 */}
      <div className="text-center text-sm text-ink-soft">
        还没有账号？{' '}
        <Link href="/register" className="font-medium text-muted-blue transition-ink hover:underline">
          立即注册
        </Link>
      </div>
    </form>
  );
}
