import Link from 'next/link';

/** 404 兜底页 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6" style={{ background: 'var(--paper)' }}>
      <div className="w-full max-w-md rounded-xl p-8 text-center" style={{ background: 'var(--paper-light)', border: '1px solid var(--border-c)' }}>
        <p className="font-brush text-6xl" style={{ color: 'var(--ink-deep)' }}>迷</p>
        <p className="mt-4 font-serif text-lg" style={{ color: 'var(--ink-mid)' }}>行到水穷处，坐看云起时</p>
        <p className="mt-4 font-ui text-sm" style={{ color: 'var(--ink-soft)' }}>你要找的页面不存在，不妨换个方向探索</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg px-5 py-2.5 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5"
            style={{ background: 'var(--ink-deep)', color: 'var(--paper-light)' }}
          >
            回到首页
          </Link>
          <Link
            href="/workbench"
            className="rounded-lg px-5 py-2.5 font-ui text-sm transition-ink hover:-translate-y-0.5"
            style={{ border: '1px solid var(--border-c)', color: 'var(--ink-mid)' }}
          >
            进入工作台
          </Link>
        </div>
      </div>
    </div>
  );
}
