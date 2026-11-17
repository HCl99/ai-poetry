import { Skeleton } from '@/components/skeleton';

/** 风格迁移骨架：左输入右输出，进页即有版面 */
export default function TransferLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="paper-card space-y-3 p-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="paper-card space-y-3 p-6">
          <Skeleton className="h-5 w-24" />
          <p className="font-ui text-sm text-ink-soft">正在准备笔砚…</p>
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
