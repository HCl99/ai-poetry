import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { mailConfigured, sendVerifyCode, type MailPurpose } from '@/lib/mailer';

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_COOLDOWN_MS = 60_000;
/** 同一邮箱 10 分钟内最多发送 5 次 */
const SEND_WINDOW_MS = 10 * 60_000;
const MAX_SENDS = 5;
/** 连续输错 5 次后锁定 10 分钟，期间不再下发新码 */
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60_000;

export type CodePurpose = MailPurpose;

export interface IssueResult {
  ok: boolean;
  error?: string;
  retryAfterSec?: number;
}

/** 6 位数字验证码（允许前导零，均匀分布） */
function genCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * 生成并发送验证码：
 * - 输错 5 次后锁定 10 分钟，锁定期内拒绝发码（否则可用新码绕过失败次数）
 * - 同一邮箱 10 分钟内最多 5 次，另加 60 秒冷却
 * - 只存 bcrypt 哈希，旧码在发新码时作废
 * - 发信失败会删除刚写入的记录，避免用户拿到一个"已存在但没收到"的码
 */
export async function issueCode(email: string, purpose: CodePurpose): Promise<IssueResult> {
  if (!mailConfigured) return { ok: false, error: '邮件服务未配置，请联系管理员' };

  // 惰性清理：删除 24 小时前的历史验证码，避免表随发码量无限增长
  await prisma.emailCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } });

  // 1. 错误次数锁定：最近 10 分钟内存在输错满 5 次的记录
  const locked = await prisma.emailCode.findFirst({
    where: {
      email,
      purpose,
      attempts: { gte: MAX_ATTEMPTS },
      createdAt: { gte: new Date(Date.now() - LOCK_MS) },
    },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  if (locked) {
    const waitMs = locked.createdAt.getTime() + LOCK_MS - Date.now();
    return {
      ok: false,
      error: '验证码错误次数过多，请 10 分钟后重试',
      retryAfterSec: Math.max(60, Math.ceil(waitMs / 1000)),
    };
  }

  // 2. 发送频率：10 分钟窗口内最多 5 次
  const windowStart = new Date(Date.now() - SEND_WINDOW_MS);
  const recent = await prisma.emailCode.findMany({
    where: { email, purpose, createdAt: { gte: windowStart } },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  if (recent.length >= MAX_SENDS) {
    return { ok: false, error: '发送频繁，请 5 分钟后重试', retryAfterSec: 300 };
  }
  if (recent.length) {
    const wait = RESEND_COOLDOWN_MS - (Date.now() - recent[0].createdAt.getTime());
    if (wait > 0) {
      return {
        ok: false,
        error: `请 ${Math.ceil(wait / 1000)} 秒后再获取`,
        retryAfterSec: Math.ceil(wait / 1000),
      };
    }
  }

  const code = genCode();
  const codeHash = await bcrypt.hash(code, 10);

  // 旧码作废：标记为已消费而不是删除，保留记录用于频率与锁定统计
  await prisma.emailCode.updateMany({
    where: { email, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const row = await prisma.emailCode.create({
    data: { email, purpose, codeHash, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    select: { id: true },
  });

  try {
    await sendVerifyCode(email, code, purpose);
  } catch (e) {
    await prisma.emailCode.delete({ where: { id: row.id } });
    console.error('sendVerifyCode failed', e);
    return { ok: false, error: '邮件发送失败，请稍后重试或联系管理员' };
  }

  return { ok: true };
}

export type VerifyResult = { ok: true } | { ok: false; error: string; retryAfterSec?: number };

/** 校验并消费验证码：一次性使用，失败累计 5 次后锁定 10 分钟 */
export async function verifyCode(email: string, purpose: CodePurpose, code: string): Promise<VerifyResult> {
  const input = code.trim();
  if (!/^\d{6}$/.test(input)) return { ok: false, error: '请输入 6 位数字验证码' };

  const row = await prisma.emailCode.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) {
    // 无有效码时，若处于锁定窗口则给出明确的等待提示
    const locked = await prisma.emailCode.findFirst({
      where: { email, purpose, attempts: { gte: MAX_ATTEMPTS }, createdAt: { gte: new Date(Date.now() - LOCK_MS) } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (locked) return { ok: false, error: '验证码错误次数过多，请 10 分钟后重试' };
    return { ok: false, error: '请先获取验证码' };
  }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: '验证码已过期，请重新获取' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: '验证码错误次数过多，请 10 分钟后重试' };

  const hit = await bcrypt.compare(input, row.codeHash);
  if (!hit) {
    const attempts = row.attempts + 1;
    await prisma.emailCode.update({ where: { id: row.id }, data: { attempts } });
    if (attempts >= MAX_ATTEMPTS) {
      return { ok: false, error: '验证码错误次数过多，请 10 分钟后重试', retryAfterSec: 600 };
    }
    return { ok: false, error: `验证码不正确，还可尝试 ${MAX_ATTEMPTS - attempts} 次` };
  }

  await prisma.emailCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return { ok: true };
}
