import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimit } from './rateLimit';

describe('rateLimit 内存滑动窗口限流', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('窗口内未超限时逐次放行，第 limit+1 次拒绝', () => {
    vi.setSystemTime(0);
    for (let i = 0; i < 5; i++) expect(rateLimit('k1', 5, 60_000).ok).toBe(true);
    const r = rateLimit('k1', 5, 60_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it('窗口滑过最旧请求后恢复放行', () => {
    vi.setSystemTime(0);
    expect(rateLimit('k2', 1, 1000).ok).toBe(true);
    expect(rateLimit('k2', 1, 1000).ok).toBe(false);
    vi.setSystemTime(1001);
    expect(rateLimit('k2', 1, 1000).ok).toBe(true);
  });

  it('超限返回的等待秒数不超过窗口长度', () => {
    vi.setSystemTime(0);
    rateLimit('k3', 1, 10_000);
    const r = rateLimit('k3', 1, 10_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeLessThanOrEqual(10);
  });

  it('部分请求滑出后按剩余容量放行', () => {
    vi.setSystemTime(0);
    rateLimit('k4', 3, 10_000);
    vi.setSystemTime(2000);
    rateLimit('k4', 3, 10_000);
    rateLimit('k4', 3, 10_000);
    // 窗口内仍有 3 条（0s/2s/2s），拒绝
    expect(rateLimit('k4', 3, 10_000).ok).toBe(false);
    // 0s 的滑出窗口后腾出容量
    vi.setSystemTime(10_001);
    expect(rateLimit('k4', 3, 10_000).ok).toBe(true);
  });

  it('不同键相互隔离', () => {
    vi.setSystemTime(0);
    expect(rateLimit('a', 1, 60_000).ok).toBe(true);
    expect(rateLimit('b', 1, 60_000).ok).toBe(true);
    expect(rateLimit('a', 1, 60_000).ok).toBe(false);
  });
});
