'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authenticate } from './actions';
import { PasswordInput, TEXT_INPUT_CLASS, INPUT_ICON_CLASS } from '@/components/password-input';
import { FormError, shakeAuthCard } from '@/components/form-error';

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
  const [success, setSuccess] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [remember, setRemember] = useState(false);
  const [savedEmail, setSavedEmail] = useState('');
  const router = useRouter();

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

  /** 邮箱即时校验：blur 时反馈格式，出错后输入中实时纠正（与注册页密码即时校验同一体验语言） */
  function checkEmail(v: string) {
    const t = v.trim();
    setEmailMsg(t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? '邮箱格式似乎不正确' : '');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    // 提前抓取表单值：React 合成事件的 currentTarget 在 await 之后会被置空
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') || '');
    setLoading(true);
    try {
      const err = await authenticate(fd);
      if (err) {
        setError(err);
        shakeAuthCard();
        setLoading(false);
        return;
      }
      // 登录成功：按勾选状态写入/清除记住的邮箱，展示成功态 0.6s 后跳转首页
      try {
        if (remember && email) localStorage.setItem(REMEMBER_KEY, email);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* 忽略存储异常 */
      }
      setLoading(false);
      setSuccess(true);
      setTimeout(() => router.push('/home'), 600);
    } catch {
      setError('网络异常，请重试');
      shakeAuthCard();
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-8 pb-2 font-ui">
      <div>
        <div className="group relative">
          <span className={INPUT_ICON_CLASS}><MailIcon /></span>
          <input
            name="email"
            type="email"
            required
            placeholder="邮箱"
            autoComplete="email"
            defaultValue={savedEmail}
            onBlur={(e) => checkEmail(e.currentTarget.value)}
            onChange={(e) => { if (emailMsg) checkEmail(e.currentTarget.value); }}
            className={TEXT_INPUT_CLASS}
          />
        </div>
        {emailMsg && <p className="mt-1.5 text-xs" style={{ color: '#A67C7C' }}>{emailMsg}</p>}
      </div>
      <PasswordInput name="password" placeholder="密码" required autoComplete="current-password" />

      <div className="flex items-center justify-between text-sm text-ink-soft">
        {/* 记住我：真实实现——勾选后本地记住邮箱，下次自动填充 */}
        <label className="flex cursor-pointer select-none items-center gap-1.5">
          <input type="checkbox" checked={remember} onChange={toggleRemember} className="accent-[#3A3835]" style={{ width: 14, height: 14 }} />
          记住我
        </label>
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
    </form>
  );
}
