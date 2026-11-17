import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { issueCode, type CodePurpose } from '@/lib/email-code';
import { checkEmailFormat } from '@/lib/email-format';

export const dynamic = 'force-dynamic';

const PURPOSES: CodePurpose[] = ['register', 'reset'];

/**
 * 发送邮箱验证码（注册 / 找回密码）
 * 防刷：IP 10 次/10 分钟 + 邮箱 60 秒冷却 + 10 分钟 5 封（issueCode 内）
 * 锁码：输错 5 次后 10 分钟内不再下发新码
 * 防枚举：找回密码时邮箱不存在也返回成功，但不发信
 */
export async function POST(req: Request) {
  let body: { email?: string; purpose?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  const purpose = body.purpose as CodePurpose;

  const emailError = checkEmailFormat(email);
  if (emailError) return Response.json({ error: emailError }, { status: 400 });
  if (!PURPOSES.includes(purpose)) return Response.json({ error: '参数不合法' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rl = rateLimit(`email-code:${ip}`, 10, 10 * 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: `请求过于频繁，请 ${rl.retryAfterSec} 秒后再试` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (purpose === 'register' && user) {
    return Response.json({ error: '该邮箱已注册，请直接登录' }, { status: 400 });
  }
  // 找回密码：邮箱不存在时不发信，但返回同样的成功态，避免探测账号是否注册
  if (purpose === 'reset' && !user) {
    return Response.json({ ok: true, message: '若该邮箱已注册，验证码将发送至邮箱', cooldown: 60 });
  }

  const res = await issueCode(email, purpose);
  if (!res.ok) {
    return Response.json(
      { error: res.error, retryAfterSec: res.retryAfterSec },
      { status: res.retryAfterSec ? 429 : 400, headers: res.retryAfterSec ? { 'Retry-After': String(res.retryAfterSec) } : undefined },
    );
  }

  return Response.json({ ok: true, message: `验证码已发送至 ${email}，10 分钟内有效`, cooldown: 60 });
}
