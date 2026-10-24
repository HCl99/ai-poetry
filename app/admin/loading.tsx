import { Skeleton } from '@/components/skeleton';

/** 管理后台加载骨架：渲染在 AdminShell 内，仅需内容区 */
export default function AdminLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2.5 h-4 w-72" />
      </div>

      <p className="font-ui text-sm text-ink-soft">正在展卷…</p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="paper-card space-y-3 p-5">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="paper-card p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-10 w-full" />
        <Skeleton className="mt-3 h-10 w-full" />
        <Skeleton className="mt-3 h-10 w-full" />
      </div>
    </div>
  );
}
