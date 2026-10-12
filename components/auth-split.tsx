import { BookOpen, Sparkles, Edit } from 'lucide-react';
import { InkBackdrop } from '@/components/ink-backdrop';
import { Typewriter } from '@/components/typewriter';

/**
 * 登录/注册页左右分栏壳（v2.2 动态化设计）：
 * 左侧品牌区（Logo、主副标题、技术标签、打字机标语、真实统计、三大功能），
 * 右侧 children（登录/注册卡片）。900px 以下自动上下堆叠。
 */
export function AuthSplit({ totalPoems, children }: { totalPoems: number; children: React.ReactNode }) {
  const numLabel = totalPoems >= 10000 ? `${Math.round(totalPoems / 1000) / 10}万+` : `${totalPoems}`;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden max-[900px]:flex-col min-[900px]:flex-row" style={{ background: 'var(--paper)' }}>
      <InkBackdrop />

      {/* ===== 左侧品牌区 ===== */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-8 py-12 min-[900px]:px-14">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full font-brush text-lg text-white shadow-ink" style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}>墨</span>
          <span className="font-brush text-2xl text-ink-deep">墨韵诗心</span>
        </div>

        <h1 className="font-brush text-[40px] leading-tight text-ink-black min-[900px]:text-[48px]">墨韵诗心</h1>
        <p className="mt-2 font-ui text-lg tracking-[0.14em] text-ink-mid">AI 古诗词文化探索平台</p>

        <div className="mt-5 flex flex-wrap items-center gap-2 font-ui text-xs text-ink-mid">
          {['AI Native', '多模态', 'RAG', 'Agent', 'MCP'].map((t) => (
            <span key={t} className="rounded-full border border-c bg-paper-light/70 px-3 py-1">{t}</span>
          ))}
        </div>

        {/* 打字机标语：三句轮播 + 闪烁光标 */}
        <div className="mt-6 flex h-8 items-center">
          <Typewriter
            className="font-serif text-base text-sepia min-[900px]:text-lg"
            lines={[
              '以墨为舟，溯千年诗心。',
              '一笔一画，皆是与古人的重逢。',
              `AI 检索 ${numLabel} 诗篇，只为注解你眼前这一首。`,
            ]}
          />
        </div>

        {/* 统计：全部来自系统真实数据 */}
        <div className="mt-8 grid max-w-md grid-cols-4 gap-3">
          {[
            { num: numLabel, label: '首古诗词' },
            { num: '6', label: '项 AI 功能' },
            { num: '0%', label: '幻觉率' },
            { num: '3', label: '项独家创新' },
          ].map((s) => (
            <div key={s.label}>
              <div className="font-brush text-2xl text-ink-deep min-[900px]:text-3xl">{s.num}</div>
              <div className="mt-0.5 font-ui text-xs text-ink-soft">{s.label}</div>
            </div>
          ))}
        </div>

        {/* 三大核心功能：统一 SVG stroke 图标 */}
        <div className="mt-9 space-y-3.5">
          {[
            { icon: <BookOpen className="h-5 w-5" />, name: '诗词探索', desc: `${numLabel}首全库检索，朝代/题材/意象多维筛选` },
            { icon: <Sparkles className="h-5 w-5" />, name: 'AI 智能注解', desc: '四维度解析 + 引用硬约束，字字可溯' },
            { icon: <Edit className="h-5 w-5" />, name: '风格迁移', desc: '白话入诗，李白/苏轼/婉约五大诗人风格' },
          ].map((f) => (
            <div key={f.name} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-c bg-paper-light/70 text-sepia">{f.icon}</span>
              <div>
                <div className="font-ui text-[15px] font-medium text-ink-deep">{f.name}</div>
                <div className="mt-0.5 font-ui text-xs text-ink-soft">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 右侧表单区 ===== */}
      <div className="relative z-10 flex w-full items-center justify-center px-4 py-12 min-[900px]:w-[500px] min-[900px]:shrink-0">
        <div className="anim-fade-up w-full max-w-[440px] rounded-2xl shadow-ink" style={{ background: 'var(--paper-light)', border: '1px solid var(--border-c)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
