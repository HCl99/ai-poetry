'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/** 路由级错误边界：Server Component 抛错时的水墨兜底页 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app error]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6" style={{ background: 'var(--paper)' }}>
      <div className="w-full max-w-md rounded-xl p-8 text-center" style={{ background: 'var(--paper-light)', border: '1px solid var(--border-c)' }}>
        <p className="font-brush text-6xl" style={{ color: 'var(--ink-deep)' }}>误</p>
        <p className="mt-4 font-serif text-lg" style={{ color: 'var(--ink-mid)' }}>山重水复疑无路</p>
        <p className="mt-1 font-serif text-lg" style={{ color: 'var(--ink-mid)' }}>柳暗花明又一村</p>
        <p className="mt-4 font-ui text-sm" style={{ color: 'var(--ink-soft)' }}>
          页面加载出了点问题，请重试{error?.digest ? `（错误码 ${error.digest}）` : ''}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg px-5 py-2.5 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5"
            style={{ background: 'var(--ink-deep)', color: 'var(--paper-light)' }}
          >
            重试
          </button>
          <Link
            href="/"
            className="rounded-lg px-5 py-2.5 font-ui text-sm transition-ink hover:-translate-y-0.5"
            style={{ border: '1px solid var(--border-c)', color: 'var(--ink-mid)' }}
          >
            回到首页
          </Link>
        </div>
      </div>
    </div>
  );
}
