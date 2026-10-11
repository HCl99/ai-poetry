'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signIn } from '@/auth';

export async function registerUser(formData: FormData): Promise<{ error?: string }> {
  const name = (formData.get('name') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const confirm = formData.get('confirm') as string;

  if (!email || !password) {
    return { error: '邮箱和密码不能为空' };
  }
  if (password !== confirm) {
    return { error: '两次输入的密码不一致' };
  }
  if (password.length < 6) {
    return { error: '密码长度至少 6 位' };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: '该邮箱已注册' };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      name: name || null,
      passwordHash,
    },
  });

  // 注册成功后自动登录
  await signIn('credentials', { email, password, redirectTo: '/workbench' });
  redirect('/workbench');
}
