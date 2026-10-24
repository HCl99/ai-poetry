'use client';

import { useEffect, useState } from 'react';

/**
 * 整句标语轮播：不再逐字打出，整句以「墨韵浮现」特效一次性显现
 * （淡入 + 上浮 + 由虚化到清晰），停留后淡出切下一句。
 * 单句时浮现一次即常驻。aria-label 固定为完整文案，读屏器不受动画影响。
 */
export function Typewriter({
  lines,
  className,
  holdMs = 3200,
}: {
  lines: string[];
  className?: string;
  holdMs?: number;
}) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  const single = lines.length <= 1;

  useEffect(() => {
    if (single) return;
    // 无障碍：系统减少动态偏好或设置中手动关闭动效时，轮播静止于首句
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.documentElement.classList.contains('motion-off')) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === 'in') t = setTimeout(() => setPhase('hold'), 750);
    else if (phase === 'hold') t = setTimeout(() => setPhase('out'), holdMs);
    else t = setTimeout(() => { setIdx((i) => (i + 1) % lines.length); setPhase('in'); }, 380);
    return () => clearTimeout(t);
  }, [phase, holdMs, single, lines.length]);

  const cur = lines[idx % lines.length];
  return (
    <span className={className} aria-label={lines[0]}>
      <span
        key={idx}
        aria-hidden="true"
        className={phase === 'out' ? 'anim-ink-veil' : 'anim-ink-reveal'}
        style={{ display: 'inline-block' }}
      >
        {cur}
      </span>
    </span>
  );
}
