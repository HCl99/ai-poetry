'use client';

import { useEffect } from 'react';

/** 动效偏好：localStorage key 与 <html> class（与 globals.css 中 html.motion-off 规则联动） */
export const MOTION_KEY = 'motion-off';

export function getMotionPref(): boolean {
  try { return localStorage.getItem(MOTION_KEY) === '1'; } catch { return false; }
}

/** 写入偏好并立即应用到 <html> class */
export function setMotionPref(off: boolean) {
  try { localStorage.setItem(MOTION_KEY, off ? '1' : '0'); } catch { /* ignore */ }
  document.documentElement.classList.toggle('motion-off', off);
}

/** 根布局初始化器（无 UI）：读回持久化偏好，登录页/工作台全部页面生效 */
export function MotionPrefInit() {
  useEffect(() => {
    document.documentElement.classList.toggle('motion-off', getMotionPref());
  }, []);
  return null;
}
