'use client';

import { useEffect } from 'react';

/**
 * 路由级错误兜底卡片：保留工作台外壳，只替换内容区。
 * 用于 AI 页面渲染异常时给「重试」入口，而不是整页白屏。
 */
export function RouteError({
  error,
  reset,
  title,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
}) {
  useEffect(() => {
    console.error('[route error]', title, error);
  }, [error, title]);

  return (
    <div
      className="rounded-xl p-8 text-center"
      style={{ background: 'var(--paper-light)', border: '1px solid var(--border-c)' }}
      role="alert"
    >
      <p className="font-serif text-lg" style={{ color: 'var(--ink-deep)' }}>
        {title}
      </p>
      <p className="mt-2 font-ui text-sm" style={{ color: 'var(--ink-soft)' }}>
        出了点问题，可重试一次；若持续失败，请稍后再来
        {error?.digest ? `（错误码 ${error.digest}）` : ''}
      </p>
      <button
        onClick={reset}
        className="mt-5 rounded-lg px-5 py-2.5 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5"
        style={{ background: 'var(--ink-deep)', color: 'var(--paper-light)' }}
      >
        重试
      </button>
    </div>
  );
}
