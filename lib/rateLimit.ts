/**
 * 内存滑动窗口限流（单实例部署适用，无需引入 Redis）。
 * 按键（route:userId）记录窗口内请求时间戳，超限返回需等待秒数；
 * 定期惰性清扫过期键，避免 Map 无限增长。
 */
const buckets = new Map<string, number[]>();
let lastSweep = 0;

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, arr] of buckets) {
    const alive = arr.filter((t) => now - t < windowMs);
    if (alive.length === 0) buckets.delete(k);
    else buckets.set(k, alive);
  }
}

export function rateLimit(key: string, limit: number, windowMs = 60_000): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now, windowMs);
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((arr[0] + windowMs - now) / 1000));
    buckets.set(key, arr);
    return { ok: false, retryAfterSec };
  }
  arr.push(now);
  buckets.set(key, arr);
  return { ok: true, retryAfterSec: 0 };
}

/**
 * AI 接口限流入口：超限直接返回 429 JSON（含 Retry-After 头），
 * 前端 SSE 客户端的 !r.ok 分支会把 error 字段透出展示。
 */
export function checkAiRateLimit(userId: string, route: string, limit: number, windowMs = 60_000): Response | null {
  const { ok, retryAfterSec } = rateLimit(`${route}:${userId}`, limit, windowMs);
  if (ok) return null;
  return Response.json(
    { error: `请求过于频繁，请 ${retryAfterSec} 秒后再试` },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}
