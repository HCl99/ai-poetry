import { Skeleton } from '@/components/skeleton';

/** 以图搜诗骨架：上传区 + 结果区 */
export default function VisionLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <Skeleton className="h-8 w-36" />
      <div className="paper-card space-y-3 p-6">
        <Skeleton className="h-40 w-full" />
        <p className="font-ui text-sm text-ink-soft">正在铺纸研墨…</p>
      </div>
    </div>
  );
}
