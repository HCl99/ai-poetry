import type { Metadata } from 'next';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: '注册 · 墨韵诗心' };

export default function RegisterPage() {
  return (
    <>
      {/* 卡头只保留场景图章 + 标题，品牌名交给左侧品牌区，避免同屏重复 */}
      <div className="px-8 pb-6 pt-8 text-center">
        <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full font-brush text-lg text-white shadow-ink" style={{ background: 'linear-gradient(135deg,#8B7355,#A67C7C)' }}>
          笔
        </div>
        <h2 className="font-brush text-[26px] leading-tight text-ink-deep">创建你的诗旅账号</h2>
        <p className="mt-1 font-ui text-sm text-ink-soft">落笔成诗，从这里开始</p>
      </div>

      <RegisterForm />
    </>
  );
}
