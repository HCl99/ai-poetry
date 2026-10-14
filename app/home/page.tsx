import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PortalClient } from './portal-client';

export const dynamic = 'force-dynamic';

/**
 * 系统首页（独立门户页，v2.5 新增）：
 * 三层导航的第 2 层——登录成功后进入，展示欢迎语、系统概览与各功能入口；
 * 点击任一入口进入带侧栏的功能工作台（/workbench/*）。本页自包含顶栏，不套用 WorkbenchShell。
 */
export default async function HomePortalPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const uid = session.user.id!;

  const [totalPoems, favCount, creationCount, annotateCount, readPoems] = await Promise.all([
    prisma.poem.count(),
    prisma.favorite.count({ where: { userId: uid } }),
    prisma.creation.count({ where: { userId: uid } }),
    prisma.history.count({ where: { userId: uid, actionType: 'annotate' } }),
    prisma.history.findMany({ where: { userId: uid, targetId: { not: null } }, distinct: ['targetId'], select: { targetId: true } }),
  ]);

  return (
    <PortalClient
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        role: session.user.role,
        avatar: session.user.avatar ?? null,
      }}
      stats={{
        totalPoems,
        readCount: readPoems.length,
        annotateCount,
        creationCount,
        favCount,
      }}
    />
  );
}
