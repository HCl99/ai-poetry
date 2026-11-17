import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '隐私政策 · 墨韵诗心' };

const SECTIONS = [
  {
    h: '一、我们收集的信息',
    p: '注册邮箱（用于账号识别与验证码）、密码（以 bcrypt 哈希存储，不保存明文）、昵称，以及你在平台内产生的检索、收藏与 AI 创作记录。',
  },
  {
    h: '二、信息用途',
    p: '上述信息仅用于账号鉴权、邮箱验证码收发、展示个人历史记录与改进检索效果，不用于广告投放或对外售卖。',
  },
  {
    h: '三、第三方服务',
    p: '生成类功能会将必要的输入文本发送至智谱 AI（GLM）以完成推理；验证码通过 SMTP 邮件服务发送至你的邮箱。除此之外不向第三方共享你的数据。',
  },
  {
    h: '四、存储与安全',
    p: '数据存储于自建 MySQL 数据库，向量检索在本地服务内完成。密码经加盐哈希处理，接口对登录尝试做频率限制以降低暴力破解风险。',
  },
  {
    h: '五、你的权利',
    p: '你可以随时修改密码、删除自己的 AI 创作记录；如需注销账号或导出数据，可通过平台反馈渠道提出，我们将在核实身份后处理。',
  },
  {
    h: '六、Cookie 使用',
    p: '平台仅使用维持登录状态所必需的会话 Cookie，不用于跨站追踪。',
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <div className="mx-auto max-w-[720px] px-6 py-14">
        <h1 className="font-brush text-[34px] leading-tight text-ink-black">隐私政策</h1>
        <p className="mt-2 font-ui text-sm text-ink-soft">最后更新：2026-11-01 · 说明我们如何收集与使用你的信息</p>

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
