import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const favs = await prisma.favorite.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const poems = await prisma.poem.findMany({
    where: { id: { in: favs.map((f) => f.poemId) } },
    select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true },
  });
  const map = new Map(poems.map((p) => [p.id, p]));
  return Response.json(
    favs
      .filter((f) => map.has(f.poemId))
      .map((f) => {
        const p = map.get(f.poemId)!;
        const lines = (p.paragraphsSimp as string[] | null) || [];
        return {
          id: f.id,
          poemId: p.id,
          title: p.title,
          author: p.author,
          dynasty: p.dynasty,
          line: lines.join(' '),
          time: f.createdAt.toISOString().slice(0, 10),
        };
      }),
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const { poemId } = (await req.json()) as { poemId?: string };
  if (!poemId) return Response.json({ error: '缺少 poemId' }, { status: 400 });

  const exist = await prisma.favorite.findUnique({
    where: { userId_poemId: { userId: session.user.id, poemId } },
  });
  if (exist) {
    await prisma.favorite.delete({ where: { id: exist.id } });
    return Response.json({ ok: true, favorited: false });
  }
  await prisma.favorite.create({ data: { userId: session.user.id, poemId } });
  const poem = await prisma.poem.findUnique({ where: { id: poemId }, select: { title: true } });
  await prisma.history.create({
    data: {
      userId: session.user.id,
      actionType: 'favorite',
      targetId: poemId,
      title: `收藏《${poem?.title ?? '诗词'}》`,
      detail: '加入我的收藏',
    },
  });
  return Response.json({ ok: true, favorited: true });
}
