import Link from 'next/link';
import type { Metadata } from 'next';
import { ForgotForm } from './forgot-form';

export const metadata: Metadata = { title: '找回密码 · 墨韵诗心' };

export default function ForgotPage() {
  return (
    <>
      <div className="px-8 pb-7 pt-10 text-center">
        <div
          className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full font-brush text-xl text-white shadow-ink"
          style={{ background: 'linear-gradient(135deg,#8B7355,#5D5853)' }}
        >
          钥
        </div>
        <div className="font-brush text-[28px] leading-tight text-ink-deep">找回密码</div>
        <p className="mt-1 font-ui text-sm text-ink-soft">通过邮箱验证码重置登录密码</p>
      </div>

      <ForgotForm />

      <div className="pb-8 text-center font-ui text-sm text-ink-soft">
        想起密码了？{' '}
        <Link href="/login" className="font-medium text-muted-blue transition-ink hover:underline">
          返回登录
        </Link>
      </div>
    </>
  );
}
