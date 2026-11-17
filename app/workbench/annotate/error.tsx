'use client';

import { RouteError } from '@/components/route-error';

export default function AnnotateError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} title="注解页加载失败" />;
}
