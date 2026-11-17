import { Skeleton } from '@/components/skeleton';

/** 注解页骨架：左侧诗卡 + 右侧四维度占位，避免进页时白屏 */
export default function AnnotateLoading() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]" role="status" aria-busy="true">
      <div className="paper-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-6 h-4 w-full" />
        <Skeleton className="mt-2.5 h-4 w-11/12" />
        <Skeleton className="mt-2.5 h-4 w-4/5" />
        <Skeleton className="mt-6 h-9 w-full" />
      </div>
      <div className="paper-card space-y-4 p-6">
        <Skeleton className="h-5 w-32" />
        <p className="font-ui text-sm text-ink-soft">正在展卷，准备注解…</p>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
