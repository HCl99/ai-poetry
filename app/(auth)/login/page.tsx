import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: '登录 · 墨韵诗心' };

export default function LoginPage() {
  return (
    <>
      <div className="px-8 pb-7 pt-10 text-center">
        {/* 卡头场景化：登录=「月」归人望乡意象（黛蓝渐变），与注册页「笔」拉开场景差异 */}
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full font-brush text-xl text-white shadow-ink" style={{ background: 'linear-gradient(135deg,#7B8EA1,#5D7185)' }}>
          月
        </div>
        <div className="font-brush text-[28px] leading-tight text-ink-deep">墨韵诗心</div>
        <p className="mt-1 font-ui text-sm text-ink-soft">欢迎回来，月色如旧，诗旅继续</p>
      </div>

      <LoginForm />

      <div className="pb-8 text-center font-ui text-sm text-ink-soft">
        还没有账号？{' '}
        <Link href="/register" className="font-medium text-muted-blue transition-ink hover:underline">
          立即注册
        </Link>
      </div>
    </>
  );
}
