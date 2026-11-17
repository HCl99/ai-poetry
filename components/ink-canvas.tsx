'use client';

import { useEffect, useRef } from 'react';

/**
 * 墨迹拖尾画布：鼠标划过/点击页面时晕开水墨粒子（径向扩散 + 渐隐，模拟宣纸洇墨）。
 * 位于背景层之上、内容层之下——表单卡片不透明，墨痕自然只在留白处可见，不干扰阅读。
 * 配色低饱和（墨/赭/黛 7:2:1 加权），仅指针精确设备启用；
 * prefers-reduced-motion 时完全不启动；无存活粒子时 rAF 休眠，零常驻开销。
 */
type Drop = { x: number; y: number; r: number; maxR: number; a: number; decay: number; c: string };

const PALETTE = [
  { c: '58,56,53', w: 0.7 }, // 墨
  { c: '139,115,85', w: 0.2 }, // 赭
  { c: '123,142,161', w: 0.1 }, // 黛
];

function pickColor(): string {
  const t = Math.random();
  let acc = 0;
  for (const { c, w } of PALETTE) {
    acc += w;
    if (t <= acc) return c;
  }
  return PALETTE[0].c;
}

export function InkCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = ref.current;
    const g2d = el?.getContext('2d');
    if (!el || !g2d) return;
    // 别名常量保证嵌套函数内的类型收窄
    const cv: HTMLCanvasElement = el;
    const ctx: CanvasRenderingContext2D = g2d;

    const drops: Drop[] = [];
    let raf = 0;
    let running = false;
    let lastX = -1;
    let lastY = -1;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(x: number, y: number, big: boolean) {
      const n = big ? 6 : 1;
      for (let i = 0; i < n; i++) {
        drops.push({
          x: x + (big ? (Math.random() - 0.5) * 26 : (Math.random() - 0.5) * 6),
          y: y + (big ? (Math.random() - 0.5) * 26 : (Math.random() - 0.5) * 6),
          r: big ? 4 + Math.random() * 6 : 2.5 + Math.random() * 4,
          maxR: big ? 34 + Math.random() * 40 : 22 + Math.random() * 26,
          a: big ? 0.16 + Math.random() * 0.08 : 0.1 + Math.random() * 0.06,
          decay: 0.93 + Math.random() * 0.03,
          c: pickColor(),
        });
      }
      if (drops.length > 140) drops.splice(0, drops.length - 140);
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    }

    function tick() {
      ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.r += (d.maxR - d.r) * 0.055;
        d.a *= d.decay;
        if (d.a < 0.004) {
          drops.splice(i, 1);
          continue;
        }
        const g = ctx.createRadialGradient(d.x, d.y, d.r * 0.15, d.x, d.y, d.r);
        g.addColorStop(0, `rgba(${d.c},${d.a})`);
        g.addColorStop(0.7, `rgba(${d.c},${d.a * 0.45})`);
        g.addColorStop(1, `rgba(${d.c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (drops.length) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
        ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
      }
    }

    function toLocal(e: MouseEvent) {
      const rect = cv.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    // 拖尾：位移超过 16px 才落下一滴，避免静止鼠标堆墨
    const onMove = (e: MouseEvent) => {
      const { x, y } = toLocal(e);
      if (lastX >= 0 && Math.hypot(x - lastX, y - lastY) < 16) return;
      lastX = x;
      lastY = y;
      spawn(x, y, false);
    };
    // 点击：一簇更大的洇墨
    const onDown = (e: MouseEvent) => {
      const { x, y } = toLocal(e);
      spawn(x, y, true);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] h-full w-full" />;
}
