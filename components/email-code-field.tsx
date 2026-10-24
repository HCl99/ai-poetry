'use client';

import { useEffect, useRef, useState } from 'react';
import { TEXT_INPUT_CLASS, INPUT_ICON_CLASS } from '@/components/password-input';

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 邮箱验证码输入行：6 位数字输入框 + 获取验证码按钮（60 秒倒计时）。
 * 发码走后端 /api/auth/email-code，服务端再校验邮箱是否已注册 / 是否存在。
 */
export function EmailCodeField({
  email,
  purpose,
}: {
  email: string;
  purpose: 'register' | 'reset';
}) {
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown(sec: number) {
    setCooldown(sec);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function send() {
    setErr('');
    setMsg('');
    const target = email.trim().toLowerCase();
    if (!EMAIL_RE.test(target)) {
      setErr('请先填写正确的邮箱');
      return;
    }
    setSending(true);
    try {
      const r = await fetch('/api/auth/email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target, purpose }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || '验证码发送失败，请重试');
        if (r.status === 429 && d.error) startCooldown(30);
        return;
      }
      setMsg(d.message || '验证码已发送，请查收邮箱（含垃圾邮件箱）');
      startCooldown(Number(d.cooldown) || 60);
    } catch {
      setErr('网络异常，请稍后重试');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="group relative flex-1">
          <span className={INPUT_ICON_CLASS}><ShieldIcon /></span>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoComplete="one-time-code"
            placeholder="6 位邮箱验证码"
            className={TEXT_INPUT_CLASS}
          />
        </div>
        <button
          type="button"
          onClick={send}
          disabled={sending || cooldown > 0}
          className="h-11 w-[104px] shrink-0 rounded-lg border-[1.5px] border-c font-ui text-[13px] text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-60"
        >
          {cooldown > 0 ? `${cooldown}s 后重发` : sending ? '发送中…' : '获取验证码'}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-1.5 min-h-[16px] font-ui text-xs">
        {err ? <span style={{ color: '#A67C7C' }}>{err}</span> : msg ? <span style={{ color: '#6B8E7B' }}>{msg}</span> : null}
      </p>
    </div>
  );
}
