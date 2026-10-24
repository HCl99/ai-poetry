'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 登录/注册页水墨动态背景：明月浮动、墨晕呼吸、墨滴晕染、远山雾移、飞鸟轻浮。
 * 纯 CSS 动画装饰层（v2.2 动态化设计），低饱和慢速，不干扰表单阅读。
 * v2.7 昼夜意境：按本地时段切换色调——清晨(5-10)淡金、午后(10-17)素白、夜晚(17-5)黛蓝墨色。
 * SSR/首帧固定 day 相位，挂载后校正（useEffect 后置），避免水合不一致；色调经 .ink-tint/.ink-moon CSS 1.6s 平滑过渡。
 * v2.8 鼠标视差：三层景深——远山/雾气(远,3px)、墨晕/墨滴(中,7px)、明月(反向漂移,-12px)。
 * 视差直接写 DOM transform（rAF 节流，不触发 React 重渲染）；仅指针精确设备启用，
 * prefers-reduced-motion / motion-off 时静止。包裹层 -inset-3 出血，位移不露边缘。
 */
type Phase = 'dawn' | 'day' | 'night';

function phaseNow(): Phase {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return 'dawn';
  if (h >= 10 && h < 17) return 'day';
  return 'night';
}

export function InkBackdrop() {
  const [phase, setPhase] = useState<Phase>('day');
  const farRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const moonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPhase(phaseNow());
  }, []);

  useEffect(() => {
    // 触屏/粗指针设备无视差；无障碍偏好时静止
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.documentElement.classList.contains('motion-off')) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        if (farRef.current) farRef.current.style.transform = `translate3d(${nx * 3}px, ${ny * 3}px, 0)`;
        if (midRef.current) midRef.current.style.transform = `translate3d(${nx * 7}px, ${ny * 7}px, 0)`;
        if (moonRef.current) moonRef.current.style.transform = `translate3d(${nx * -12}px, ${ny * -12}px, 0)`;
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden="true" className={`ink-phase-${phase} pointer-events-none absolute inset-0 overflow-hidden`}>
      {/* 时段色调罩层：黎明淡金 / 夜晚黛蓝，白日透明 */}
      <div className="ink-tint absolute inset-0" />

      {/* 远层：山、雾、飞鸟（视差 3px） */}
      <div ref={farRef} className="absolute -inset-3 will-change-transform">
        {/* 远山（两层静态剪影） */}
        <svg className="absolute bottom-0 left-0 w-[110%] text-ink-mid" viewBox="0 0 1440 260" fill="none" preserveAspectRatio="none" style={{ opacity: 0.16 }}>
          <path d="M0 260V150Q200 60 420 130T880 100T1440 140V260Z" fill="currentColor" />
        </svg>
        <svg className="absolute bottom-0 left-0 w-full text-ink-deep" viewBox="0 0 1440 200" fill="none" preserveAspectRatio="none" style={{ opacity: 0.1 }}>
          <path d="M0 200V110Q260 30 520 95T1040 80T1440 110V200Z" fill="currentColor" />
        </svg>
        {/* 山间雾气：横移 */}
        <div
          className="anim-ink-drift absolute bottom-[14%] left-0 h-16 w-[130%]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(250,248,243,0.55), transparent)' }}
        />
        {/* 飞鸟：轻浮 */}
        <svg className="anim-ink-float absolute left-[20%] top-[17%] h-8 w-16 text-ink-mid" viewBox="0 0 64 32" fill="none" style={{ opacity: 0.35, animationDelay: '-3s' }}>
          <path d="M8 20q8-10 16 0M28 14q8-10 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* 中层：墨晕色块、墨滴晕染（视差 7px） */}
      <div ref={midRef} className="absolute -inset-3 will-change-transform">
        {/* 墨晕色块 ×3：错峰呼吸 */}
        <div className="anim-ink-breathe absolute left-[6%] top-[22%] h-64 w-64 rounded-full blur-[80px]" style={{ background: 'rgba(123,142,161,0.16)' }} />
        <div className="anim-ink-breathe absolute right-[16%] bottom-[18%] h-56 w-56 rounded-full blur-[70px]" style={{ background: 'rgba(196,169,101,0.13)', animationDelay: '-4s' }} />
        <div className="anim-ink-breathe absolute left-[38%] top-[56%] h-52 w-52 rounded-full blur-[70px]" style={{ background: 'rgba(107,142,123,0.12)', animationDelay: '-8s' }} />
        {/* 墨滴晕染：左上 + 右下双滴，周期性扩散消散 */}
        <div
          className="anim-ink-spread absolute left-[15%] top-[28%] h-44 w-44 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,115,85,0.3) 0%, rgba(139,115,85,0.08) 55%, transparent 75%)' }}
        />
        <div
          className="anim-ink-spread absolute bottom-[12%] right-[10%] h-52 w-52 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(123,142,161,0.26) 0%, rgba(123,142,161,0.07) 55%, transparent 75%)', animationDelay: '-3.5s' }}
        />
      </div>

      {/* 明月：反向漂移 -12px（梦境感），缓慢浮动，色调随时段变化（昼淡金→夜月白） */}
      <div ref={moonRef} className="absolute -inset-3 will-change-transform">
        <div className="absolute right-[12%] top-[9%]">
          <div className="ink-moon anim-ink-float h-28 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}
