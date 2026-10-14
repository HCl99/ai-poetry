import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * 首页入口：打开即直达核心体验。
 * 未登录 → 跳转登录/注册页；已登录 → 跳转工作台。
 * （v2.5 移除落地页，首页不再渲染营销展示）
 */
export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect('/workbench');
  redirect('/login');
}
