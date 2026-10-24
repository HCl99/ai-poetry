import { Skeleton } from '@/components/skeleton';

/** 工作台加载骨架：渲染在 WorkbenchShell 内，仅需内容区 */
export default function WorkbenchLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2.5 h-4 w-64" />
      </div>

      <p className="font-ui text-sm text-ink-soft">正在展卷…</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="paper-card space-y-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
