import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** 通知列表：返回当前用户的所有通知（最多 50 条），附带未读数 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const [list, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, read: false },
    }),
  ]);

  return Response.json({
    items: list.map((n) => ({
      id: String(n.id),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
    unread,
  });
}

/** 标记已读：all=true 标记全部；id 标记单条 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { all?: boolean; id?: string };

  if (body.all) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, read: false },
      data: { read: true },
    });
    return Response.json({ ok: true });
  }

  if (body.id) {
    try {
      const nid = BigInt(body.id);
      const r = await prisma.notification.updateMany({
        where: { id: nid, userId: session.user.id },
        data: { read: true },
      });
      if (r.count === 0) return Response.json({ error: '通知不存在' }, { status: 404 });
      return Response.json({ ok: true });
    } catch {
      return Response.json({ error: 'id 非法' }, { status: 400 });
    }
  }

  return Response.json({ error: '请指定 all 或 id' }, { status: 400 });
}
