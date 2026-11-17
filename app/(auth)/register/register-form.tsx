'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registerUser } from './actions';
import { PasswordInput, TEXT_INPUT_CLASS, INPUT_ICON_CLASS } from '@/components/password-input';
import { FormError, shakeAuthCard } from '@/components/form-error';
import { EmailCodeField } from '@/components/email-code-field';
import { checkEmailFormat } from '@/lib/email-format';

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

/** 密码强度：0 未输入 / 1 弱 / 2 中 / 3 强——长度与字符种类（小写/大写/数字/符号）综合计分 */
function pwdStrength(v: string): 0 | 1 | 2 | 3 {
  if (!v) return 0;
  if (v.length < 6) return 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(v)).length;
  if (v.length >= 10 && kinds >= 3) return 3;
  if (kinds >= 2 && v.length >= 8) return 3;
  if (kinds >= 2 || v.length >= 8) return 2;
  return 1;
}

const STRENGTH_META = [
  { label: '', color: '' },
  { label: '弱', color: '#A67C7C' },
  { label: '中', color: '#C4A965' },
  { label: '强', color: '#6B8E7B' },
] as const;

/** 8-20 位，且必须同时包含数字与字母 */
const PWD_RE = /^(?=.*\d)(?=.*[A-Za-z]).{8,20}$/;

export function RegisterForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [pwd, setPwd] = useState('');
  const [email, setEmail] = useState('');
  const strength = pwdStrength(pwd);

  /** 邮箱即时校验：blur 时反馈格式，出错后输入中实时纠正 */
  function checkEmail(v: string) {
    const t = v.trim();
    setEmailMsg(t ? checkEmailFormat(t) || '' : '');
  }

  /** 确认密码即时比对：输入即提示，不留到提交后 */
  function checkConfirm(e: React.ChangeEvent<HTMLInputElement>) {
    const form = e.currentTarget.form;
    const pwd = form?.querySelector<HTMLInputElement>('input[name="password"]')?.value || '';
    const c = e.currentTarget.value;
    setConfirmMsg(c && pwd !== c ? '两次输入的密码不一致' : '');
  }

  function validate(e: React.FormEvent<HTMLFormElement>): string {
    const fd = new FormData(e.currentTarget);
    const emailValue = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const confirm = String(fd.get('confirm') || '');
    const emailError = checkEmailFormat(emailValue);
    if (emailError) return emailError;
    if (password.length < 8 || password.length > 20) return '密码长度需为 8-20 位';
    if (!PWD_RE.test(password)) return '密码需同时包含数字和字母';
    if (password !== confirm) return '两次输入的密码不一致';
    return '';
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const pre = validate(e);
    if (pre) {
      setError(pre);
      shakeAuthCard();
      return;
    }
    setLoading(true);
    try {
      const res = await registerUser(new FormData(e.currentTarget));
      if (res?.error) {
        setError(res.error);
        shakeAuthCard();
        setLoading(false);
      }
      // 成功时 server action 内部 redirect 到 /workbench
    } catch {
      setError('网络异常，请重试');
      shakeAuthCard();
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-8 pb-8 font-ui">
      <div className="group relative">
        <span className={INPUT_ICON_CLASS}><UserIcon /></span>
        <input name="name" placeholder="昵称（选填）" autoComplete="nickname" className={TEXT_INPUT_CLASS} />
      </div>
      <div>
        <div className="group relative">
          <span className={INPUT_ICON_CLASS}><MailIcon /></span>
          <input
            name="email"
            type="email"
            required
            placeholder="邮箱（支持 QQ 邮箱等主流邮箱）"
            autoComplete="email"
            onBlur={(e) => checkEmail(e.currentTarget.value)}
            onChange={(e) => { setEmail(e.currentTarget.value); if (emailMsg) checkEmail(e.currentTarget.value); }}
            className={TEXT_INPUT_CLASS}
          />
        </div>
        {emailMsg && <p className="mt-1.5 text-xs" style={{ color: '#A67C7C' }}>{emailMsg}</p>}
      </div>
      <EmailCodeField email={email} purpose="register" />
      <div>
        <PasswordInput
          name="password"
          placeholder="密码（8-20 位，含数字和字母）"
          required
          minLength={8}
          maxLength={20}
          autoComplete="new-password"
          onChange={(e) => setPwd(e.currentTarget.value)}
        />
        {/* 密码强度指示：三段墨色条 + 档位标签，输入时实时更新 */}
        {strength > 0 && (
          <div className="mt-2 flex items-center gap-2" aria-live="polite">
            <div className="flex flex-1 gap-1.5">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-1 flex-1 rounded-full transition-ink"
                  style={{ background: i <= strength ? STRENGTH_META[strength].color : 'var(--border-light)' }}
                />
              ))}
            </div>
            <span className="w-4 font-ui text-xs" style={{ color: STRENGTH_META[strength].color }}>
              {STRENGTH_META[strength].label}
            </span>
          </div>
        )}
      </div>
      <div>
        <PasswordInput
          name="confirm"
          placeholder="确认密码"
          required
          minLength={8}
          maxLength={20}
          autoComplete="new-password"
          onChange={checkConfirm}
          onBlur={checkConfirm}
        />
        {confirmMsg && (
          <p className="mt-1.5 text-xs" style={{ color: '#A67C7C' }}>{confirmMsg}</p>
        )}
      </div>

      <FormError msg={error} />

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg font-ui text-[15px] font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}
      >
        {loading && <span className="spinner" style={{ width: 16, height: 16 }} />}
        {loading ? '注册中…' : '注  册'}
      </button>

      <p className="text-center font-ui text-[11px] leading-relaxed text-ink-soft">
        注册即表示同意{' '}
        <Link href="/legal/terms" className="text-muted-blue transition-ink hover:underline">《用户协议》</Link>
        {' '}与{' '}
        <Link href="/legal/privacy" className="text-muted-blue transition-ink hover:underline">《隐私政策》</Link>
      </p>

      <div className="text-center text-sm text-ink-soft">
        已有账号？{' '}
        <Link href="/login" className="font-medium text-muted-blue transition-ink hover:underline">
          直接登录
        </Link>
      </div>
    </form>
  );
}
