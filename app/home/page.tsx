import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { dayIndexOf } from '@/lib/daily';
import { PortalClient } from './portal-client';

export const dynamic = 'force-dynamic';

/**
 * 系统首页（独立门户页，v2.5 新增）：
 * 三层导航的第 2 层——登录成功后进入，展示欢迎语、系统概览与各功能入口；
 * 点击任一入口进入带侧栏的功能工作台（/workbench/*）。本页自包含顶栏，不套用 WorkbenchShell。
 */
export default async function HomePortalPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role === 'disabled') redirect('/login');
  const uid = session.user.id!;

  const [totalPoems, favCount, creationCount, annotateCount, readPoems, dailyCount, histories] = await Promise.all([
    prisma.poem.count(),
    prisma.favorite.count({ where: { userId: uid } }),
    prisma.creation.count({ where: { userId: uid } }),
    prisma.history.count({ where: { userId: uid, actionType: 'annotate' } }),
    prisma.history.findMany({ where: { userId: uid, targetId: { not: null } }, distinct: ['targetId'], select: { targetId: true } }),
    // 每日一诗基数：仅取「有 AI 注解 + 有标签」的优质库，保证门户卡内容质量
    prisma.poem.count({ where: { annotations: { isNot: null }, tags: { not: '[]' } } }),
    prisma.history.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

  // 每日一诗：按当日日期散列确定性取签（与工作台同源 lib/daily），当日固定、次日轮换
  const dailyPoem = dailyCount
    ? await prisma.poem.findFirst({
        where: { annotations: { isNot: null }, tags: { not: '[]' } },
        select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true },
        skip: dayIndexOf(dailyCount),
      })
    : null;

  const daily =
    dailyPoem && Array.isArray(dailyPoem.paragraphsSimp)
      ? {
          id: dailyPoem.id,
          title: dailyPoem.title,
          author: dailyPoem.author,
          dynasty: dailyPoem.dynasty,
          lines: (dailyPoem.paragraphsSimp as string[]).filter((s) => typeof s === 'string' && s.trim().length > 0).slice(0, 2),
        }
      : null;

  // 研习足迹：BigInt id / Date 在服务端序列化为纯文本（时间文本服务端格式化，
  // 避免 SSR 与客户端时区差异触发水合告警，与工作台「最近浏览」同一格式）
  const footprints = histories.map((h) => ({
    id: h.id.toString(),
    actionType: h.actionType,
    title: h.title ?? '',
    detail: h.detail ?? '',
    time: h.createdAt.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  }));

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
      daily={daily}
      footprints={footprints}
    />
  );
}
