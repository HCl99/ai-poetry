'use client';

import { useEffect, useState } from 'react';

/**
 * 打字机标语：逐字打出 → 停留 → 逐字删除 → 下一句循环。
 * loop=false 时打完即停（光标持续闪烁），适用于登录后首页的单句标语。
 * aria-label 固定为完整文案，避免读屏器读到打字中间态。
 */
export function Typewriter({
  lines,
  className,
  speed = 170,
  holdMs = 2600,
  loop = true,
}: {
  lines: string[];
  className?: string;
  speed?: number;
  holdMs?: number;
  loop?: boolean;
}) {
  const [text, setText] = useState('');
  const [idx, setIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const cur = lines[idx % lines.length];
    // 单句且打完：停止，仅保留光标闪烁
    if (!loop && !deleting && text === cur) return;
    if (!deleting && text === cur) {
      const t = setTimeout(() => setDeleting(true), holdMs);
      return () => clearTimeout(t);
    }
    if (deleting && text === '') {
      setDeleting(false);
      setIdx((i) => (i + 1) % lines.length);
      return;
    }
    const t = setTimeout(
      () => setText(deleting ? cur.slice(0, text.length - 1) : cur.slice(0, text.length + 1)),
      deleting ? Math.max(40, speed / 2.5) : speed,
    );
    return () => clearTimeout(t);
  }, [text, deleting, idx, lines, speed, holdMs, loop]);

  return (
    <span className={className} aria-label={lines[0]}>
      <span aria-hidden="true">{text}</span>
      <span className="type-caret" aria-hidden="true" />
    </span>
  );
}
