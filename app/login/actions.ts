'use server';

import { headers } from 'next/headers';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { rateLimit } from '@/lib/rateLimit';

export async function authenticate(formData: FormData): Promise<string> {
  // 防爆破：按 IP+邮箱组合限流，5 次/分钟
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rl = rateLimit(`login:${ip}:${email}`, 5, 60_000);
  if (!rl.ok) return `尝试过于频繁，请 ${rl.retryAfterSec} 秒后再试`;

  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/home',
    });
    return '';
  } catch (error) {
    if (error instanceof AuthError) {
      return '邮箱或密码错误，请重试';
    }
    if (error instanceof Error && error.message === 'ACCOUNT_DISABLED') {
      return '该账号已被禁用，请联系管理员';
    }
    throw error;
  }
}
