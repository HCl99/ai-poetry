import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { InkBackdrop } from '@/components/ink-backdrop';

export const metadata: Metadata = { title: '登录 · 墨韵诗心' };

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12" style={{ background: 'var(--paper)' }}>
      <InkBackdrop />
      <div className="anim-fade-up relative w-full max-w-[440px] rounded-2xl shadow-ink" style={{ background: 'var(--paper-light)', border: '1px solid var(--border-c)' }}>
        <div className="px-8 pb-8 pt-10 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full font-brush text-xl text-white shadow-ink" style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}>
            墨
          </div>
          <div className="font-brush text-[28px] leading-tight text-ink-deep">墨韵诗心</div>
          <p className="mt-1 font-ui text-sm text-ink-soft">登录以继续你的诗词探索之旅</p>
        </div>

        <LoginForm />

        <div className="pb-8 text-center font-ui text-sm text-ink-soft">
          还没有账号？{' '}
          <Link href="/register" className="font-medium text-muted-blue transition-ink hover:underline">
            立即注册
          </Link>
        </div>
      </div>
    </div>
  );
}
