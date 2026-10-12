import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { AuthSplit } from '@/components/auth-split';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: '注册 · 墨韵诗心' };

export default async function RegisterPage() {
  const totalPoems = await prisma.poem.count();
  return (
    <AuthSplit totalPoems={totalPoems}>
      <div className="px-8 pb-7 pt-10 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full font-brush text-xl text-white shadow-ink" style={{ background: 'linear-gradient(135deg,#8B7355,#A67C7C)' }}>
          墨
        </div>
        <div className="font-brush text-[28px] leading-tight text-ink-deep">墨韵诗心</div>
        <p className="mt-1 font-ui text-sm text-ink-soft">注册账号，开启诗词文化探索</p>
      </div>

      <RegisterForm />

      <div className="pb-8 text-center font-ui text-sm text-ink-soft">
        已有账号？{' '}
        <Link href="/login" className="font-medium text-muted-blue transition-ink hover:underline">
          直接登录
        </Link>
      </div>
    </AuthSplit>
  );
}
