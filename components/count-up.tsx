'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 统计数字滚动计数：SSR/首帧直出终值（水合一致、无 JS 时可见），
 * 首次进入视口后从 0 滚动到终值；系统偏好 prefers-reduced-motion 时保持静态终值。
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = '',
  delay = 0,
  duration = 1500,
  group = false,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  /** 进入视口后延迟启动（毫秒），用于多指标级联 */
  delay?: number;
  duration?: number;
  /** 整数千分位分组（如 272475 → 272,475），默认关闭以不影响既有调用 */
  group?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  // 动画控制句柄：清理时可立刻 rAF.cancel
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);

  const fmt = (v: number) =>
    group
      ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : v.toFixed(decimals);
  const [text, setText] = useState(() => fmt(value));

  // 主流程：IO 入视口 → 定时 → rAF tick
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 系统偏好「减少动态效果」：数字直接呈现终值
    if (reduced) {
      setText(fmt(value));
      started.current = false;
      ioRef.current?.disconnect();
      ioRef.current = null;
      return;
    }

    if (!('IntersectionObserver' in window)) {
      setText(fmt(value));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || started.current) return;
        started.current = true;
        io.disconnect();

        timerRef.current = setTimeout(() => {
          const t0 = performance.now();
          const tick = () => {
            const p = Math.min(1, (performance.now() - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setText(fmt(value * eased));
            if (p < 1) {
              rafRef.current = requestAnimationFrame(tick);
            } else {
              setText(fmt(value));
              rafRef.current = null;
            }
          };
          setText(fmt(0));
          rafRef.current = requestAnimationFrame(tick);
        }, delay);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    ioRef.current = io;

    return () => {
      io.disconnect();
      ioRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      rafRef.current = null;
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, delay, duration, group]);

  return (
    <span ref={ref}>
      {text}
      {suffix}
    </span>
  );
}
