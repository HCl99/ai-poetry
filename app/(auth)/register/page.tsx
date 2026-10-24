import Link from 'next/link';
import type { Metadata } from 'next';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: '注册 · 墨韵诗心' };

export default function RegisterPage() {
  return (
    <>
      <div className="px-8 pb-7 pt-10 text-center">
        {/* 卡头场景化：注册=「笔」落笔初墨意象（赭石-茜色渐变），与登录页「月」拉开场景差异 */}
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full font-brush text-xl text-white shadow-ink" style={{ background: 'linear-gradient(135deg,#8B7355,#A67C7C)' }}>
          笔
        </div>
        <div className="font-brush text-[28px] leading-tight text-ink-deep">墨韵诗心</div>
        <p className="mt-1 font-ui text-sm text-ink-soft">落笔即诗，开启你的文化探索</p>
      </div>

      <RegisterForm />

      <div className="pb-8 text-center font-ui text-sm text-ink-soft">
        已有账号？{' '}
        <Link href="/login" className="font-medium text-muted-blue transition-ink hover:underline">
          直接登录
        </Link>
      </div>
    </>
  );
}
