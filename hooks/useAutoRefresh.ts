'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 轻量实时同步：仅当标签页可见时按间隔轮询，切回页面立即补一次。
 * 用于帖子审核状态这类「由另一端操作引起」的数据，避免页面停留在旧快照。
 * 相比 SSE，这里不需要跨进程事件总线，换机复现也更简单。
 */
export function useAutoRefresh(task: () => void | Promise<void>, intervalMs = 5000) {
  const taskRef = useRef(task);
  taskRef.current = task;
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      await taskRef.current();
    } finally {
      setLastSync(Date.now());
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (intervalMs <= 0) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs, refresh]);

  return { lastSync, syncing, refresh };
}

export function formatSyncTime(ts: number | null): string {
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
