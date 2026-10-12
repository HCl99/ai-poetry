import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dayIndexOf } from './daily';

describe('dayIndexOf 每日一诗散列', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('同一天多次调用结果一致（当日全站固定）', () => {
    vi.setSystemTime(new Date('2026-10-12T08:00:00'));
    const a = dayIndexOf(500);
    vi.setSystemTime(new Date('2026-10-12T23:59:59'));
    expect(dayIndexOf(500)).toBe(a);
  });

  it('结果始终落在 [0, total) 区间', () => {
    vi.setSystemTime(new Date('2026-10-12T08:00:00'));
    for (const total of [1, 7, 100, 5000]) {
      const idx = dayIndexOf(total);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(total);
    }
  });

  it('total 为 0 时不崩溃（除零保护）', () => {
    vi.setSystemTime(new Date('2026-10-12T08:00:00'));
    expect(dayIndexOf(0)).toBe(0);
  });

  it('不同日期倾向产生不同索引（隔日轮换）', () => {
    vi.setSystemTime(new Date('2026-10-12T08:00:00'));
    const d1 = dayIndexOf(500);
    vi.setSystemTime(new Date('2026-10-13T08:00:00'));
    const d2 = dayIndexOf(500);
    vi.setSystemTime(new Date('2026-10-14T08:00:00'));
    const d3 = dayIndexOf(500);
    expect(new Set([d1, d2, d3]).size).toBeGreaterThan(1);
  });
});
