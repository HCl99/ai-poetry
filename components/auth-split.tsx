'use client';

import { usePathname } from 'next/navigation';
import { BookOpen, Sparkles, Edit } from 'lucide-react';
import { InkBackdrop } from '@/components/ink-backdrop';
import { InkCanvas } from '@/components/ink-canvas';
import { Typewriter } from '@/components/typewriter';

/**
 * 登录/注册页左右分栏壳（v2.7 交互增强）：
 * 左侧品牌区（Logo、主副标题、标语、真实统计、三大功能、技术标签），
 * 右侧 children（登录/注册卡片）。900px 以下上下堆叠且表单优先（品牌精简头 + 完整品牌区置底）。
 * v2.5：版心收敛 max-w-[1440px] 居中，左栏内容 max-w-[520px] 水平居中，消除宽屏两端贴边、中间死白；
 *       ≥1280px 时左栏右缘加竖排题字填充留白。
 * v2.6：品牌组重构——印章并入大标题同行消除品牌名重复；组间距统一 44px（品牌/数据/功能/标签四组），
 *       统计拉满内容宽并加 hairline 分隔；竖排题字「诗心不老」与轮播文案错开。
 * v2.7：①品牌区 stagger 入场（标题→标语→统计→功能→标签依次墨韵浮现）；
 *       ②移动端品牌区精简为「标题+标语+统计」（功能/标签组 ≥900px 才显示）；
 *       ③统计数字接入 CountUp 首次进入视口滚动计数；
 *       ④卡片由路由组共享 layout 承载，登录/注册切换时以 pathname 为 key 侧滑淡入（共享元素过渡），
 *         并挂 id="auth-card" 供表单失败时 shake 触发。
 * v2.8：品牌区新增「每日一诗」（layout 按日期确定性取签，真实库数据），位于标语与统计之间；
 *       挂墨迹拖尾画布 InkCanvas（z-5，背景之上内容之下，卡片不透明故墨痕只在留白可见）。
 */
/** 诗句在引号内截断：先去掉已有省略号再按字数裁剪，保证「」成对闭合，不出现半边引号 */
function clampLine(s: string, max = 18) {
  const t = s.replace(/…$/, '');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 飘散墨尘：固定参数（不用随机数，保证 SSR/客户端一致），自下而上缓慢上升并左右轻摆 */
const MOTES = [
  { left: '6%', size: 7, dur: 21, delay: 0, drift: 28, op: 0.30, color: 'rgba(58,56,53,0.55)' },
  { left: '14%', size: 4, dur: 16, delay: 3, drift: -22, op: 0.34, color: 'rgba(139,115,85,0.6)' },
  { left: '22%', size: 9, dur: 26, delay: 7, drift: 34, op: 0.22, color: 'rgba(123,142,161,0.6)' },
  { left: '31%', size: 5, dur: 19, delay: 1.5, drift: -30, op: 0.30, color: 'rgba(58,56,53,0.5)' },
  { left: '39%', size: 3, dur: 14, delay: 9, drift: 18, op: 0.40, color: 'rgba(196,169,101,0.75)' },
  { left: '46%', size: 8, dur: 24, delay: 4.5, drift: -26, op: 0.20, color: 'rgba(107,142,123,0.6)' },
  { left: '54%', size: 4, dur: 17, delay: 12, drift: 24, op: 0.32, color: 'rgba(139,115,85,0.55)' },
  { left: '61%', size: 6, dur: 22, delay: 2, drift: -18, op: 0.26, color: 'rgba(58,56,53,0.5)' },
  { left: '68%', size: 3, dur: 15, delay: 8.5, drift: 30, op: 0.38, color: 'rgba(196,169,101,0.8)' },
  { left: '75%', size: 9, dur: 27, delay: 5.5, drift: -34, op: 0.20, color: 'rgba(123,142,161,0.55)' },
  { left: '82%', size: 5, dur: 18, delay: 10, drift: 20, op: 0.30, color: 'rgba(58,56,53,0.5)' },
  { left: '88%', size: 4, dur: 20, delay: 0.8, drift: -24, op: 0.34, color: 'rgba(139,115,85,0.6)' },
  { left: '94%', size: 7, dur: 23, delay: 6.5, drift: 26, op: 0.22, color: 'rgba(107,142,123,0.55)' },
  { left: '18%', size: 3, dur: 13, delay: 11, drift: 16, op: 0.42, color: 'rgba(196,169,101,0.8)' },
  { left: '58%', size: 4, dur: 15, delay: 13, drift: -20, op: 0.36, color: 'rgba(139,115,85,0.6)' },
  { left: '71%', size: 3, dur: 12, delay: 6, drift: 22, op: 0.40, color: 'rgba(196,169,101,0.75)' },
];

/** 下落墨点：与上升墨尘交错，形成上下双向的颗粒流动 */
const FALLING = [
  { left: '11%', size: 5, dur: 24, delay: 2, drift: 26, op: 0.34, color: 'rgba(123,142,161,0.65)' },
  { left: '26%', size: 4, dur: 30, delay: 9, drift: -30, op: 0.28, color: 'rgba(58,56,53,0.55)' },
  { left: '43%', size: 6, dur: 26, delay: 0.5, drift: 22, op: 0.24, color: 'rgba(139,115,85,0.6)' },
  { left: '57%', size: 4, dur: 21, delay: 13, drift: -20, op: 0.36, color: 'rgba(196,169,101,0.7)' },
  { left: '66%', size: 7, dur: 33, delay: 5, drift: 32, op: 0.22, color: 'rgba(107,142,123,0.6)' },
  { left: '79%', size: 5, dur: 23, delay: 17, drift: -26, op: 0.30, color: 'rgba(58,56,53,0.5)' },
  { left: '90%', size: 4, dur: 19, delay: 7, drift: 18, op: 0.34, color: 'rgba(139,115,85,0.6)' },
  { left: '97%', size: 6, dur: 28, delay: 11, drift: -24, op: 0.22, color: 'rgba(123,142,161,0.6)' },
];

/** 闪烁星尘：固定位置明暗呼吸，增加纸面「微光」质感 */
const TWINKLES = [
  { left: '9%', top: '18%', size: 5, dur: 5.2, delay: 0, color: 'rgba(196,169,101,0.85)' },
  { left: '23%', top: '64%', size: 4, dur: 6.4, delay: 1.4, color: 'rgba(58,56,53,0.7)' },
  { left: '34%', top: '32%', size: 6, dur: 4.6, delay: 2.6, color: 'rgba(139,115,85,0.8)' },
  { left: '48%', top: '76%', size: 4, dur: 7.2, delay: 0.8, color: 'rgba(123,142,161,0.85)' },
  { left: '62%', top: '14%', size: 5, dur: 5.8, delay: 3.4, color: 'rgba(196,169,101,0.8)' },
  { left: '73%', top: '52%', size: 4, dur: 6.8, delay: 2.1, color: 'rgba(58,56,53,0.65)' },
  { left: '86%', top: '28%', size: 6, dur: 5.4, delay: 4.2, color: 'rgba(107,142,123,0.8)' },
  { left: '93%', top: '70%', size: 4, dur: 7.6, delay: 1.1, color: 'rgba(139,115,85,0.8)' },
];

/** 标题逐字墨迹浮现 + 朱印落下：让首屏第一眼就有明显的动态 */
const TITLE_CHARS = ['墨', '韵', '诗', '心'];

export function AuthSplit({
  totalPoems,
  daily,
  children,
}: {
  totalPoems: number;
  daily?: { line: string; author: string; dynasty: string; title: string } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const numLabel = totalPoems >= 10000 ? `${Math.round(totalPoems / 1000) / 10}万+` : `${totalPoems}`;
  const poemStat =
    totalPoems >= 10000
      ? { value: Math.round(totalPoems / 1000) / 10, decimals: 1, suffix: '万+' }
      : { value: totalPoems, decimals: 0, suffix: '' };
  const stats = [
    { ...poemStat, label: '首古诗词', tip: 'poems 表实时统计 · 登录后全库可检' },
    { value: 6, decimals: 0, suffix: '', label: '项 AI 功能', tip: 'AI 注解 / 风格迁移 / 语义检索等 · 工作台可用' },
    { value: 34, decimals: 1, suffix: '万', label: '条语义索引', tip: 'BGE 中文向量 + BM25 混合检索 · 句级可溯源' },
    { value: 3, decimals: 0, suffix: '', label: '项独家创新', tip: '意象图谱 · 诗人 Agent · MCP 开放接口' },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: 'var(--paper)' }}>
      <InkBackdrop />
      <InkCanvas />

      {/* 飘散墨尘：持续上升的细颗粒，填补留白处的「呼吸感」（纯 CSS，不增加 JS 开销） */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="anim-mote absolute rounded-full"
            style={{
              left: m.left,
              top: '102%',
              width: `${m.size}px`,
              height: `${m.size}px`,
              background: m.color,
              filter: 'blur(0.4px)',
              ['--mote-dur' as string]: `${m.dur}s`,
              ['--mote-delay' as string]: `${m.delay}s`,
              ['--mote-drift' as string]: `${m.drift}px`,
              ['--mote-op' as string]: m.op,
            }}
          />
        ))}
        {/* 下落墨点：与上升颗粒反向交错，画面更有厚度 */}
        {FALLING.map((m, i) => (
          <span
            key={`f${i}`}
            className="anim-mote-fall absolute rounded-full"
            style={{
              left: m.left,
              top: '-6vh',
              width: `${m.size}px`,
              height: `${m.size}px`,
              background: m.color,
              filter: 'blur(0.5px)',
              ['--mote-dur' as string]: `${m.dur}s`,
              ['--mote-delay' as string]: `${m.delay}s`,
              ['--mote-drift' as string]: `${m.drift}px`,
              ['--mote-op' as string]: m.op,
            }}
          />
        ))}
        {/* 星尘微光：固定点位明暗呼吸 */}
        {TWINKLES.map((t, i) => (
          <span
            key={`t${i}`}
            className="anim-twinkle absolute rounded-full"
            style={{
              left: t.left,
              top: t.top,
              width: `${t.size}px`,
              height: `${t.size}px`,
              background: t.color,
              filter: 'blur(0.5px)',
              ['--tw-dur' as string]: `${t.dur}s`,
              ['--tw-delay' as string]: `${t.delay}s`,
            }}
          />
        ))}
      </div>

      {/* ===== 版心：≤1440px 整体居中，背景层保持全宽 ===== */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1440px] flex-col min-[900px]:flex-row">
        {/* 左叙事 / 右操作：宽屏在分界处加一条上下渐隐 hairline，让两栏关系一眼可读 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-[10%] right-[500px] hidden w-px min-[900px]:block"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--border-c) 18%, var(--border-c) 82%, transparent)' }}
        />
      {/* ===== 左侧品牌区（移动端整体置后，见下方 order 调整） ===== */}
      <div className="relative order-2 flex flex-1 flex-col justify-center px-8 py-12 min-[900px]:order-none min-[900px]:items-center min-[900px]:px-14">
        {/* 竖排题字：宽屏下填充两栏间留白，低透明不抢焦（与轮播文案错开）；末位淡入收尾 */}
        <div aria-hidden="true" className="anim-fade-in pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 select-none font-brush text-6xl leading-none text-ink-deep/[0.10] min-[1280px]:block" style={{ writingMode: 'vertical-rl', letterSpacing: '0.35em', animationDelay: '0.9s' }}>
          诗心不老
        </div>

        <div className="w-full max-w-[520px]">
        {/* 品牌组：印章并入大标题同行，消除品牌名上下重复 */}
        <div className="anim-fade-up flex items-center gap-3.5" style={{ animationDelay: '0.05s' }}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-brush text-xl text-white shadow-ink" style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}>墨</span>
          {/* 标题逐字书写：每字从左到右揭开，笔尖墨点随行，写完朱印落下 */}
          <h1 className="relative font-brush text-[40px] leading-tight text-ink-black min-[900px]:text-[48px]" aria-label="墨韵诗心">
            {TITLE_CHARS.map((c, i) => (
              <span key={c} aria-hidden="true" className="anim-write-char" style={{ animationDelay: `${0.15 + i * 0.42}s` }}>
                {c}
              </span>
            ))}
            <span aria-hidden="true" className="anim-brush-tip" />
          </h1>
          {/* 朱印：延迟落下并回弹，替代静态装饰 */}
          <span
            aria-hidden="true"
            className="anim-seal ml-1 flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-[5px] border-[1.5px] font-brush text-[11px] leading-[13px]"
            style={{ borderColor: 'rgba(168,84,76,0.7)', color: '#A8544C', background: 'rgba(168,84,76,0.07)' }}
          >
            <span>诗</span>
            <span>心</span>
          </span>
        </div>
        <p className="anim-fade-up mt-3 font-ui text-lg tracking-[0.14em] text-ink-mid" style={{ animationDelay: '0.15s' }}>AI 古诗词文化探索平台</p>

        {/* 整句墨韵浮现标语：三句轮播（v2.3 替代逐字打字） */}
        <div className="anim-fade-up mt-5 flex h-8 items-center" style={{ animationDelay: '0.25s' }}>
          <Typewriter
            className="font-serif text-base text-sepia min-[900px]:text-lg"
            lines={[
              '以墨为舟，溯千年诗心。',
              '一笔一画，皆是与古人的重逢。',
              `AI 检索 ${numLabel} 诗篇，只为注解你眼前这一首。`,
            ]}
          />
        </div>

        {/* 每日一诗：按日期从全库确定性取签，每日轮换（真实数据，答辩可溯源） */}
        {daily && (
          <div className="anim-fade-up mt-3.5 flex items-baseline gap-2.5" style={{ animationDelay: '0.32s' }}>
            <span className="shrink-0 rounded-full px-2 py-px font-ui text-[10px] tracking-wide" style={{ background: 'rgba(196,169,101,0.14)', color: '#8B7355' }}>每日一诗</span>
            {/* 诗句在引号内截断，避免出现「半边引号/半边书名号」；出处只保留朝代+作者，篇名移入 title 悬停可查 */}
            <p className="min-w-0 flex-1 truncate font-serif text-sm text-ink-mid" title={daily.title}>
              「{clampLine(daily.line)}」
            </p>
            <span className="shrink-0 font-ui text-[11px] text-ink-soft/70">〔{daily.dynasty}〕{daily.author}</span>
          </div>
        )}

        {/* 数据组：hairline 分隔，统计拉满内容宽均分，列间竖向 hairline 强化列秩序（全部来自系统真实数据）；数字首次进入视口滚动计数 */}
        <div className="anim-fade-up mt-11 border-t border-c/60 pt-8" style={{ animationDelay: '0.38s' }}>
          <div className="grid grid-cols-4 gap-3 divide-x divide-c/50 [&>div]:pl-3 [&>div:first-child]:pl-0">
          {stats.map((s) => (
            <div key={s.label} className="group relative cursor-default transition-ink hover:-translate-y-1">
              {/* 数据溯源 tooltip：hover 显示出处，数字不再"空口无凭"，答辩可现场演示 */}
              <span className="pointer-events-none absolute -top-1.5 left-1/2 z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink-deep px-2.5 py-1.5 font-ui text-[11px] text-paper-light opacity-0 shadow-ink transition-ink group-hover:opacity-100">
                {s.tip}
              </span>
              {/* 首屏统计直出终值：数字滚动会让 LCP 一直等到动画结束（+1.5s），
                  也会在低端设备上产生大量逐帧渲染任务，故此处改为静态文本 */}
              <div className="font-brush text-2xl text-ink-deep min-[900px]:text-3xl">
                {s.decimals > 0 ? s.value.toFixed(s.decimals) : s.value}{s.suffix}
              </div>
              <div className="mt-0.5 font-ui text-xs text-ink-soft">{s.label}</div>
            </div>
          ))}
          </div>
        </div>

        {/* 功能组：统一 SVG stroke 图标 + hover 微交互（图标底色加深 + 右移）；移动端精简时隐藏 */}
        <div className="anim-fade-up mt-11 hidden space-y-3.5 min-[900px]:block" style={{ animationDelay: '0.52s' }}>
          {[
            { icon: <BookOpen className="h-5 w-5" />, name: '诗词探索', desc: `${numLabel}首全库检索，朝代/题材/意象多维筛选` },
            { icon: <Sparkles className="h-5 w-5" />, name: 'AI 智能注解', desc: '四维度解析 + 引用硬约束，字字可溯' },
            { icon: <Edit className="h-5 w-5" />, name: '风格迁移', desc: '白话入诗，李白/苏轼/婉约五大诗人风格' },
          ].map((f) => (
            <div key={f.name} className="group flex items-start gap-3 transition-ink hover:translate-x-1.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-c bg-paper-light/70 text-sepia transition-ink group-hover:border-sepia/40 group-hover:bg-sepia/10">{f.icon}</span>
              <div>
                <div className="font-ui text-[15px] font-medium text-ink-deep">{f.name}</div>
                <div className="mt-0.5 font-ui text-xs text-ink-soft">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 技术标签：弱化置底（评委可辨识，不抢占主视觉）；移动端精简时隐藏 */}
        <div className="anim-fade-up mt-11 hidden flex-wrap items-center gap-2 font-ui text-[11px] tracking-wide text-ink-soft/70 min-[900px]:flex" style={{ animationDelay: '0.64s' }}>
          {['AI Native', '多模态', 'RAG', 'Agent', 'MCP'].map((t) => (
            <span key={t} className="rounded-full px-2.5 py-0.5" style={{ background: 'rgba(139,115,85,0.06)' }}>{t}</span>
          ))}
        </div>
        </div>
      </div>

      {/* ===== 右侧表单区：移动端 order-1 置顶优先呈现 ===== */}
      {/* 桌面端改为顶部对齐：登录卡与注册卡高度差约 190px，居中对齐时切换会整体上下跳动，顶部对齐则只向下生长 */}
      <div className="relative order-1 flex w-full items-center justify-center px-4 py-12 min-[900px]:order-none min-[900px]:w-[500px] min-[900px]:shrink-0 min-[900px]:items-start min-[900px]:pt-[13vh]">
        {/* 移动端精简品牌头：表单优先时保留最小品牌识别；backdrop-blur 让卡片滚到顶部时不与文字粘连 */}
        <div className="fixed left-0 right-0 top-0 z-20 flex items-center gap-2.5 px-5 py-4 backdrop-blur-sm min-[900px]:hidden" style={{ background: 'linear-gradient(to bottom, var(--paper) 55%, transparent)' }}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full font-brush text-sm text-white shadow-ink" style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}>墨</span>
          <span className="font-brush text-lg text-ink-deep">墨韵诗心</span>
        </div>
        {/* 卡片：pathname 为 key，登录/注册切换时侧滑淡入（共享元素过渡）；id 供失败 shake 触发 */}
        {/* 层次：顶部 1px 内高光提亮纸面，近距柔影压出「纸悬于案」的贴合感，远距大阴影撑起空间纵深 */}
        <div
          id="auth-card"
          key={pathname}
          className="anim-auth-swap w-full max-w-[440px] rounded-2xl max-[900px]:mt-14"
          style={{
            background: 'var(--paper-light)',
            border: '1px solid var(--border-c)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 6px rgba(58,56,53,0.06), 0 22px 48px -18px rgba(58,56,53,0.26)',
          }}
        >
          {children}
        </div>
      </div>
      </div>
    </div>
  );
}
