'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * 工作台欢迎卡水墨场景轮播（v2.2 动态化）：
 * 4 张纯 CSS/SVG 水墨场景背景，每张背景对应一句贴合系统的话，8s crossfade 自动轮换。
 * 场景均为低饱和水墨 Pastel 渐变 + 场景专属装饰，零图片依赖；底部圆点可手动切换。
 */
const SCENES: { key: string; name: string; line: string; bg: string; deco: ReactNode }[] = [
  {
    key: 'moon',
    name: '明月夜',
    line: '以墨为舟，溯千年诗心 —— 让 AI 陪你读遍唐宋。',
    bg: 'linear-gradient(120deg,#2C2C34 0%,#3A3835 55%,#4A4E5A 100%)',
    deco: (
      <div
        className="absolute -right-6 -top-14 h-52 w-52 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(196,169,101,0.4) 0%, rgba(196,169,101,0.12) 55%, transparent 75%)' }}
      />
    ),
  },
  {
    key: 'rain',
    name: '烟雨江南',
    line: '烟雨落江南 —— AI 检索五万诗篇，为你溯源每一处意境。',
    bg: 'linear-gradient(120deg,#525D68 0%,#7B8EA1 60%,#96A5B2 100%)',
    deco: (
      <>
        <div
          className="absolute inset-0 opacity-30"
          style={{ background: 'repeating-linear-gradient(105deg, transparent 0 26px, rgba(250,248,243,0.14) 26px 27px)' }}
        />
        <div className="anim-ink-drift absolute bottom-6 left-0 h-10 w-[130%]" style={{ background: 'linear-gradient(90deg, transparent, rgba(250,248,243,0.3), transparent)' }} />
      </>
    ),
  },
  {
    key: 'mountain',
    name: '空山新雨',
    line: '空山新雨后 —— 四维度注解，读懂王维笔下的秋天。',
    bg: 'linear-gradient(120deg,#38443C 0%,#5C7A68 60%,#8FAE9C 100%)',
    deco: (
      <>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 180" fill="none" preserveAspectRatio="none" style={{ opacity: 0.22 }}>
          <path d="M0 180V90Q240 10 480 75T980 60T1440 85V180Z" fill="#FAF8F3" />
        </svg>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 120" fill="none" preserveAspectRatio="none" style={{ opacity: 0.16 }}>
          <path d="M0 120V60Q300 -10 620 45T1160 35T1440 55V120Z" fill="#FAF8F3" />
        </svg>
      </>
    ),
  },
  {
    key: 'desert',
    name: '大漠孤烟',
    line: '大漠孤烟直，长河落日圆 —— 引用可溯，字字有据。',
    bg: 'linear-gradient(120deg,#544234 0%,#8B7355 55%,#C4A965 100%)',
    deco: (
      <>
        <div className="absolute bottom-0 left-[18%] h-24 w-24 rounded-full" style={{ background: 'radial-gradient(circle, rgba(250,248,243,0.5) 0%, rgba(250,248,243,0.18) 55%, transparent 75%)' }} />
        <div className="absolute bottom-[26%] left-[22%] h-16 w-[2px]" style={{ background: 'linear-gradient(to top, rgba(250,248,243,0.35), transparent)' }} />
      </>
    ),
  },
];

const ROTATE_MS = 8000;

export function HeroCarousel({ children }: { children: ReactNode }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SCENES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  const scene = SCENES[idx];

  return (
    <section className="relative overflow-hidden rounded-xl">
      {/* 背景层：crossfade 轮播 */}
      {SCENES.map((s, i) => (
        <div
          key={s.key}
          aria-hidden="true"
          className="absolute inset-0 transition-opacity duration-[1200ms] ease-in-out"
          style={{ opacity: i === idx ? 1 : 0 }}
        >
          <div className="absolute inset-0" style={{ background: s.bg }} />
          {s.deco}
        </div>
      ))}
      {/* 场景名水印 */}
      <span
        key={`name-${idx}`}
        className="anim-fade-up absolute right-6 top-5 z-10 font-brush text-sm"
        style={{ color: 'rgba(245,242,236,0.4)' }}
      >
        {scene.name}
      </span>

      {/* 内容层 */}
      <div className="relative z-10 p-6 md:p-8">
        {children}
        {/* 场景句：随背景切换淡入 */}
        <p key={`line-${idx}`} className="anim-fade-up mt-2 min-h-[1.6em] font-serif text-[15px]" style={{ color: 'rgba(245,242,236,0.88)' }}>
          {scene.line}
        </p>
        {/* 场景指示器 */}
        <div className="mt-4 flex gap-1.5">
          {SCENES.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setIdx(i)}
              aria-label={`切换到场景：${s.name}`}
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: i === idx ? 22 : 8,
                background: i === idx ? 'rgba(245,242,236,0.92)' : 'rgba(245,242,236,0.35)',
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
