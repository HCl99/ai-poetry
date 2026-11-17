'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signIn } from '@/auth';
import { rateLimit } from '@/lib/rateLimit';
import { verifyCode } from '@/lib/email-code';
import { checkEmailFormat } from '@/lib/email-format';

/** 密码规则需与客户端保持一致 */
const PWD_RE = /^(?=.*\d)(?=.*[A-Za-z]).{8,20}$/;

export async function registerUser(formData: FormData): Promise<{ error?: string }> {
  const name = (formData.get('name') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const confirm = formData.get('confirm') as string;
  const code = (formData.get('code') as string)?.trim();

  if (!email || !password) {
    return { error: '邮箱和密码不能为空' };
  }
  const emailError = checkEmailFormat(email);
  if (emailError) {
    return { error: emailError };
  }
  if (!code) {
    return { error: '请填写邮箱验证码' };
  }
  if (password !== confirm) {
    return { error: '两次输入的密码不一致' };
  }
  if (password.length < 8 || password.length > 20) {
    return { error: '密码长度需为 8-20 位' };
  }
  if (!PWD_RE.test(password)) {
    return { error: '密码需同时包含数字和字母' };
  }

  // 防刷注册：按 IP 限流，3 次/分钟
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rl = rateLimit(`register:${ip}`, 3, 60_000);
  if (!rl.ok) return { error: `注册过于频繁，请 ${rl.retryAfterSec} 秒后再试` };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: '该邮箱已注册' };
  }

  // 邮箱验证码：一次性消费，校验失败不创建账号
  const verified = await verifyCode(email, 'register', code);
  if (!verified.ok) {
    return { error: verified.error };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // 登录用户名：取邮箱前缀（去掉非法字符），重名时追加序号保证唯一
  const base = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'user';
  let username = base;
  for (let n = 1; await prisma.user.findUnique({ where: { username } }); n++) {
    username = `${base}${n}`;
  }
  await prisma.user.create({
    data: {
      email,
      name: name || null,
      username,
      passwordHash,
    },
  });

  // 注册成功后自动登录（signIn 携 redirectTo 时内部完成跳转）
  await signIn('credentials', { account: email, password, redirectTo: '/home' });
  redirect('/home');
}
