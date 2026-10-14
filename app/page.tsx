import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * 首页入口（v2.5 三层导航）：
 * 未登录 → 跳转登录/注册页；已登录 → 跳转系统首页（独立门户页 /home）。
 * 门户页再由用户点击进入带侧栏的功能工作台 /workbench。
 */
export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect('/home');
  redirect('/login');
}
