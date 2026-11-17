'use client';

import { RouteError } from '@/components/route-error';

export default function VisionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} title="以图搜诗页加载失败" />;
}
