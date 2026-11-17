'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * 工作台欢迎卡水墨场景轮播（v2.5 古典图景化）：
 * 4 幅古典水墨山水图（AI 绘制的中国画，存于 public/），每幅配一句贴合系统的话，
 * 8s crossfade 自动轮换；图景叠加墨色压暗遮罩以保证文字可读，并做缓慢推移（Ken Burns）。
 * 底部圆点可手动切换；动效随系统「减少动态效果」偏好静止。
 */
const SCENES: { key: string; name: string; line: string; img: string; scrim: string; deco?: ReactNode }[] = [
  {
    key: 'moon',
    name: '明月夜',
    line: '一轮明月出天山 —— 让 AI 陪你读遍唐宋，溯千年诗心。',
    img: '/ink-hero.jpg',
    scrim: 'linear-gradient(105deg, rgba(26,26,32,0.74) 0%, rgba(26,26,32,0.5) 46%, rgba(26,26,32,0.22) 100%)',
  },
  {
    key: 'rain',
    name: '烟雨江南',
    line: '烟雨落江南 —— AI 检索五万诗篇，为你溯源每一处意境。',
    img: '/ink-rain.jpg',
    scrim: 'linear-gradient(105deg, rgba(30,46,56,0.72) 0%, rgba(30,46,56,0.48) 46%, rgba(30,46,56,0.2) 100%)',
    deco: (
      <div className="anim-ink-drift absolute bottom-6 left-0 h-10 w-[130%] opacity-70" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--on-image) 22%, transparent), transparent)' }} />
    ),
  },
  {
    key: 'mountain',
    name: '空山新雨',
    line: '空山新雨后 —— 四维度注解，读懂王维笔下的秋天。',
    img: '/ink-mountain.jpg',
    scrim: 'linear-gradient(105deg, rgba(26,40,32,0.72) 0%, rgba(26,40,32,0.46) 46%, rgba(26,40,32,0.2) 100%)',
  },
  {
    key: 'desert',
    name: '大漠孤烟',
    line: '大漠孤烟直，长河落日圆 —— 引用可溯，字字有据。',
    img: '/ink-desert.jpg',
    scrim: 'linear-gradient(105deg, rgba(46,36,24,0.74) 0%, rgba(46,36,24,0.5) 46%, rgba(46,36,24,0.22) 100%)',
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
    <section className="relative overflow-hidden rounded-xl shadow-ink">
      {/* 背景层：古典水墨图 crossfade + 缓慢推移 */}
      {SCENES.map((s, i) => (
        <div
          key={s.key}
          aria-hidden="true"
          className="absolute inset-0 transition-opacity duration-[1200ms] ease-in-out"
          style={{ opacity: i === idx ? 1 : 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.img} alt="" className="anim-ink-pan h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: s.scrim }} />
          {s.deco}
        </div>
      ))}
      {/* 场景名水印 */}
      <span
        key={`name-${idx}`}
        className="anim-fade-up absolute right-6 top-5 z-10 font-brush text-sm"
        style={{ color: 'color-mix(in srgb, var(--on-image) 45%, transparent)' }}
      >
        {scene.name}
      </span>

      {/* 内容层 */}
      <div className="relative z-10 p-5 md:p-6">
        {children}
        {/* 场景句：随背景切换淡入 */}
        <p key={`line-${idx}`} className="anim-fade-up mt-2 min-h-[1.6em] font-serif text-[15px]" style={{ color: 'color-mix(in srgb, var(--on-image) 90%, transparent)' }}>
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
                background: i === idx ? 'color-mix(in srgb, var(--on-image) 92%, transparent)' : 'color-mix(in srgb, var(--on-image) 35%, transparent)',
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
