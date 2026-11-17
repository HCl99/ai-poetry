import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '用户协议 · 墨韵诗心' };

const SECTIONS = [
  {
    h: '一、服务说明',
    p: '本平台是基于大语言模型与知识库检索增强的古诗词文化探索工具，提供诗词检索、AI 注解、诗人风格迁移、以图搜诗等功能，供学习、研究与文化推广使用。',
  },
  {
    h: '二、账号与验证',
    p: '注册需通过邮箱验证码校验，账号仅限本人使用。请妥善保管密码；发现账号异常时可通过「忘记密码」重置，重置后原有登录状态会立即失效。',
  },
  {
    h: '三、AI 生成内容',
    p: '平台输出由模型基于库内诗词与诗人资料生成，并带有引用溯源标记。受模型能力限制，生成结果可能存在偏差，仅供学习参考，不构成学术结论或专业建议。',
  },
  {
    h: '四、使用规范',
    p: '不得批量爬取全库数据、对接口进行压测或滥用、上传违法违规内容，或以任何方式规避访问限制。违反者我们有权限制或终止账号使用。',
  },
  {
    h: '五、协议变更',
    p: '功能与服务条款可能随版本迭代调整，变更后将在本页更新。继续使用即视为接受更新后的协议。',
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <div className="mx-auto max-w-[720px] px-6 py-14">
        <h1 className="font-brush text-[34px] leading-tight text-ink-black">用户协议</h1>
        <p className="mt-2 font-ui text-sm text-ink-soft">最后更新：2026-11-01 · 适用于墨韵诗心全部功能</p>

        <div className="paper-card mt-8 space-y-6 p-8">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="font-ui text-[15px] font-medium text-ink-deep">{s.h}</h2>
              <p className="mt-1.5 font-ui text-sm leading-7 text-ink-mid">{s.p}</p>
            </section>
          ))}
        </div>

        <Link href="/login" className="mt-8 inline-block font-ui text-sm text-muted-blue transition-ink hover:underline">
          ← 返回登录
        </Link>
      </div>
    </main>
  );
}
