'use client';

import { useState } from 'react';

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </>
      ) : (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/** focus 墨晕：边框加深 + 四层墨色光晕经 transition-ink 平滑扩散；外层 group 供图标随 focus-within 上色 */
export const PASSWORD_INPUT_CLASS =
  'h-11 w-full rounded-lg border-[1.5px] border-c bg-white/60 pl-10 pr-10 text-sm outline-none transition-ink focus:border-ink-deep focus:shadow-[0_0_0_4px_rgba(58,56,53,0.10),0_2px_14px_rgba(58,56,53,0.08)]';

export const TEXT_INPUT_CLASS =
  'h-11 w-full rounded-lg border-[1.5px] border-c bg-white/60 pl-10 pr-3 text-sm outline-none transition-ink focus:border-ink-deep focus:shadow-[0_0_0_4px_rgba(58,56,53,0.10),0_2px_14px_rgba(58,56,53,0.08)]';

/** 左侧图标容器：focus-within 时图标由灰墨转为深墨（配合 group 作用域） */
export const INPUT_ICON_CLASS =
  'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft transition-ink group-focus-within:text-[#3A3835]';

/** 密码输入框：带锁形图标与明文/密文切换，登录注册与弹窗共用 */
export function PasswordInput({
  name,
  placeholder,
  required,
  minLength,
  autoComplete,
  onChange,
  onBlur,
}: {
  name: string;
  placeholder: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  // 大写锁定监测：按下/抬起任意键时同步状态，开启时在框下提示
  function trackCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCaps(e.getModifierState?.('CapsLock') ?? false);
  }
  return (
    <div className="group relative">
      <span className={INPUT_ICON_CLASS}><LockIcon /></span>
      <input
        name={name}
        type={show ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={trackCaps}
        onKeyUp={trackCaps}
        className={PASSWORD_INPUT_CLASS}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? '隐藏密码' : '显示密码'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft transition-ink hover:text-ink-mid"
        tabIndex={-1}
      >
        <EyeIcon off={show} />
      </button>
      {caps && (
        <p className="mt-1.5 text-xs" style={{ color: '#C4A965' }} role="status">
          大写锁定已开启
        </p>
      )}
    </div>
  );
}
