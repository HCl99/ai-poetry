import { Skeleton } from '@/components/skeleton';

/** 系统首页加载骨架：顶栏 + 欢迎卡 + 统计/内容网格 */
export default function HomeLoading() {
  return (
    <div className="min-h-screen" role="status" aria-busy="true">
      <header className="glass-strong fixed inset-x-0 top-0 z-40 h-16 border-b border-light">
        <div className="flex h-full items-center gap-3 px-4 md:px-6">
          <Skeleton className="h-8 w-8 !rounded-full" />
          <Skeleton className="h-5 w-28" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 pb-20 pt-24">
        <p className="mb-4 font-ui text-sm text-ink-soft">正在展卷…</p>

        <Skeleton className="h-[240px] w-full !rounded-2xl" />

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px] w-full !rounded-xl" />
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-[260px] w-full !rounded-xl" />
          <Skeleton className="h-[260px] w-full !rounded-xl" />
        </div>
      </main>
    </div>
  );
}
