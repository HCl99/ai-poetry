'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 统计数字滚动计数：SSR/首帧直出终值（水合一致、无 JS 时可见），
 * 首次进入视口后从 0 滚动到终值；prefers-reduced-motion / motion-off 保持静态终值。
 *
 * v2.9 运行时响应：动效开关切换即时生效
 *   ① 动画进行中关闭 → 立即停在终值（cancel rAF + setText 终值）
 *   ② 关闭后重新打开 → 从 0 重新滚动（started ref 重置 + IO 重建）
 *   ③ 动画完成后切换 → 数字停在终值；再次打开会重播（用户主动行为）
 * 依赖：MutationObserver 监听 <html class="motion-off"> 变化，单一事实来源与 motion-pref / motion-toggle 一致。
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = '',
  delay = 0,
  duration = 1500,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  /** 进入视口后延迟启动（毫秒），用于多指标级联 */
  delay?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // started 允许重置：motion-off 从 true→false 时置回 false，让 effect 重建 IO 后能再次触发
  const started = useRef(false);
  // 动画控制句柄：让"中途关闭"能立刻 rAF.cancel 并终值归位
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);

  const fmt = (v: number) => v.toFixed(decimals);
  const [text, setText] = useState(() => fmt(value));

  // motion-off 运行时订阅：MutationObserver 监听 html class 变化，保证开关切换即时响应
  const [motionOff, setMotionOff] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    // 初次挂载：同步一次（MotionPrefInit 可能已在更早时机置好 class）
    setMotionOff(el.classList.contains('motion-off'));
    const obs = new MutationObserver(() => {
      setMotionOff(el.classList.contains('motion-off'));
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // 主流程：IO 入视口 → 定时 → rAF tick；motionOff 变动会触发 effect 清理并重建
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 【关闭态】立刻停掉正在跑的一切，数字 snap 到终值，并把 started 重置为 false
    // 让 effect 重建 IO 后（motionOff 变 false）可再次触发滚动
    if (motionOff || reduced) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      rafRef.current = null;
      timerRef.current = null;
      setText(fmt(value));
      started.current = false;
      // 同时清掉上一轮 effect 残留的 IO
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
          // 定时到期再双重判定一次——用户可能在 setTimeout 等待期间关掉了动效
          if (document.documentElement.classList.contains('motion-off')) {
            setText(fmt(value));
            return;
          }
          const t0 = performance.now();
          const tick = () => {
            // tick 内实时判定：动画中途关掉，立刻 cancel 并终值归位
            if (document.documentElement.classList.contains('motion-off')) {
              setText(fmt(value));
              rafRef.current = null;
              return;
            }
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
    // motionOff 放在依赖里：开关切换 → effect 清理重建；其余依赖与首次挂载保持一致
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, delay, duration, motionOff]);

  return (
    <span ref={ref}>
      {text}
      {suffix}
    </span>
  );
}
