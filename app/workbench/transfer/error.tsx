'use client';

import { RouteError } from '@/components/route-error';

export default function TransferError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} title="风格迁移页加载失败" />;
}
