'use server';

import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { verifyCode } from '@/lib/email-code';
import { checkEmailFormat } from '@/lib/email-format';

/** 与注册页保持同一密码规则 */
const PWD_RE = /^(?=.*\d)(?=.*[A-Za-z]).{8,20}$/;

/** 找回密码：邮箱验证码校验通过后重置密码，验证码一次性消费 */
export async function resetPassword(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const code = (formData.get('code') as string)?.trim();
  const password = formData.get('password') as string;
  const confirm = formData.get('confirm') as string;

  if (!email || !password) return { error: '邮箱和新密码不能为空' };
  const emailError = checkEmailFormat(email);
  if (emailError) return { error: emailError };
  if (!code) return { error: '请填写邮箱验证码' };
  if (password !== confirm) return { error: '两次输入的密码不一致' };
  if (password.length < 8 || password.length > 20) return { error: '密码长度需为 8-20 位' };
  if (!PWD_RE.test(password)) return { error: '密码需同时包含数字和字母' };

  // 防爆破：按 IP 限流 5 次/分钟
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rl = rateLimit(`reset:${ip}`, 5, 60_000);
  if (!rl.ok) return { error: `请求过于频繁，请 ${rl.retryAfterSec} 秒后再试` };

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  // 统一话术：不暴露邮箱是否注册
  if (!user) return { error: '验证码不正确或已失效' };

  const verified = await verifyCode(email, 'reset', code);
  if (!verified.ok) return { error: verified.error };

  const passwordHash = await bcrypt.hash(password, 10);
  // 打上改密时间戳：此前签发的所有 JWT 会话立即失效
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date() } });
  // 清理该邮箱剩余验证码，避免重复使用
  await prisma.emailCode.deleteMany({ where: { email, purpose: 'reset' } });

  return { success: true };
}
