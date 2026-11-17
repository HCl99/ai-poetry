'use server';

import { headers } from 'next/headers';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { rateLimit } from '@/lib/rateLimit';

export async function authenticate(formData: FormData): Promise<string> {
  // 防爆破：按 IP+账号组合限流，5 次/分钟
  const account = String(formData.get('account') || '').trim().toLowerCase();
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rl = rateLimit(`login:${ip}:${account}`, 5, 60_000);
  if (!rl.ok) return `尝试过于频繁，请 ${rl.retryAfterSec} 秒后再试`;

  try {
    await signIn('credentials', {
      account: formData.get('account'),
      password: formData.get('password'),
      // 成功不在服务端 redirect：交由客户端展示「✓ 正在进入诗境」成功态后自行 router.push('/home')
      redirect: false,
    });
    return '';
  } catch (error) {
    if (error instanceof AuthError) {
      return '账号或密码错误，请重试';
    }
    if (error instanceof Error && error.message === 'ACCOUNT_DISABLED') {
      return '该账号已被禁用，请联系管理员';
    }
    throw error;
  }
}
