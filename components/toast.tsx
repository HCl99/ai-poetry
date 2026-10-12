'use client';

import { useCallback, useRef, useState } from 'react';

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2500);
  }, []);
  return { msg, show };
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div
      className="fixed bottom-8 left-1/2 z-[999] -translate-x-1/2 rounded-full px-7 py-3 text-sm anim-fade-up"
      style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
    >
      {msg}
    </div>
  );
}
