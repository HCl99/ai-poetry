'use client';

import { useEffect, useRef, useState } from 'react';
import { TEXT_INPUT_CLASS, INPUT_ICON_CLASS } from '@/components/password-input';
import { checkEmailFormat } from '@/lib/email-format';

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

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
    const emailError = checkEmailFormat(target);
    if (emailError) {
      setErr(emailError);
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
        // 锁定/频控时按服务端给出的等待秒数倒计时，避免按钮提前恢复可点
        if (r.status === 429) startCooldown(Number(d.retryAfterSec) || 30);
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
      {/* 发送按钮内嵌在输入框右侧（suffix），比并列两列更省横向空间，与其他字段宽度对齐 */}
      <div className="group relative">
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
          style={{ paddingRight: 116 }}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || cooldown > 0}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1.5 font-ui text-[12px] text-muted-blue transition-ink hover:bg-paper-dark disabled:opacity-50"
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
