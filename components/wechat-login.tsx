'use client';

import { useState } from 'react';

/** 微信登录入口：当前为预告按钮，点击提示而非虚假跳转（名实相符原则） */
export function WechatLoginButton() {
  const [info, setInfo] = useState('');
  return (
    <>
      <div className="flex items-center gap-3 px-8 pt-5">
        <span className="h-px flex-1" style={{ background: 'var(--border-c)' }} />
        <span className="font-ui text-xs text-ink-soft">或</span>
        <span className="h-px flex-1" style={{ background: 'var(--border-c)' }} />
      </div>
      <div className="px-8 pt-4">
        <button
          type="button"
          onClick={() => setInfo('微信扫码登录即将上线，当前请使用邮箱注册体验')}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-ink-mid/40 font-ui text-sm text-ink-deep transition-ink hover:border-ink-deep hover:bg-paper-dark"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 3C4.9 3 2 5.5 2 8.6c0 1.8 1 3.4 2.5 4.4L4 15l2.3-1.2c.7.2 1.4.3 2.2.3" />
            <path d="M9 12.7c0-2.8 2.7-5 6-5s6 2.2 6 5-2.7 5-6 5c-.7 0-1.3-.1-1.9-.2L11 19l.4-2c-1.5-.9-2.4-2.4-2.4-4.3Z" />
          </svg>
          微信登录
        </button>
        {info && (
          <p className="mt-2.5 rounded-lg px-3 py-2 text-center font-ui text-xs" style={{ background: 'rgba(123,142,161,0.1)', color: '#7B8EA1' }}>
            {info}
          </p>
        )}
      </div>
    </>
  );
}
