'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function authenticate(formData: FormData): Promise<string> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/workbench',
    });
    return '';
  } catch (error) {
    if (error instanceof AuthError) {
      return '邮箱或密码错误，请重试';
    }
    throw error;
  }
}
