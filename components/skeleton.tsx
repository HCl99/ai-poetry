import type { CSSProperties } from 'react';

/** 基础骨架块：纸色微光扫过，动效已在 globals.css 接入减少动态守卫 */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={`skeleton-shimmer rounded-lg ${className}`} style={style} />;
}
