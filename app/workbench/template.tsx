'use client';

/** 工作台路由切换时重挂载，触发页面级淡入过渡动画 */
export default function WorkbenchTemplate({ children }: { children: React.ReactNode }) {
  return <div className="anim-page">{children}</div>;
}
