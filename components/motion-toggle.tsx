'use client';

import { useEffect, useState } from 'react';
import { getMotionPref, setMotionPref } from '@/components/motion-pref';

/**
 * 登录/注册页动效开关：左下角悬浮墨丸，一键切换全站动效。
 * 与工作台个人设置共用同一偏好（localStorage 'motion-off'，根布局 MotionPrefInit 每页应用）——
 * 若用户曾手动关闭，背景明月/墨晕/视差/拖尾会全部静止，此开关提供免控制台的找回入口。
 * CSS 动画随 class 切换即时生效；JS 驱动效果（视差/拖尾/轮播/count-up）挂载时检测，刷新后完整生效。
 * SSR 渲染中性文案，挂载后读回真实偏好，避免水合不一致；仅桌面端显示（移动端动效少且易遮挡统计区）。
 */
export function MotionToggle() {
  const [off, setOff] = useState<boolean | null>(null);

  useEffect(() => {
    setOff(getMotionPref());
  }, []);

  function toggle() {
    const next = !(off ?? false);
    setMotionPref(next);
    setOff(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={off ? '你已关闭动效（此前在个人设置中切换），点击重新开启；JS 动效刷新页面后完整生效' : '动效已开启，点击可关闭'}
      className="fixed bottom-6 left-6 z-30 hidden items-center gap-1.5 rounded-full border border-c bg-paper-light/85 px-3 py-1.5 font-ui text-xs text-ink-mid shadow-ink backdrop-blur-sm transition-ink hover:-translate-y-0.5 hover:text-ink-deep min-[900px]:flex"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={off ? { opacity: 0.45 } : undefined}>
        <path d="M12 2.7 6.7 8.6a7 7 0 1 0 10.6 0L12 2.7Z" />
      </svg>
      {off === null ? '动效' : off ? '动效·关' : '动效·开'}
    </button>
  );
}
