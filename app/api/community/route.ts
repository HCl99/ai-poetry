import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** 作品社区：分享流 + 点赞 */
export async function GET() {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  const [mine, feed] = await Promise.all([
    prisma.creation.findMany({
      where: { userId: uid },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        _count: { select: { likes: true } },
        likes: { where: { userId: uid }, select: { id: true } },
      },
    }),
    prisma.creation.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        _count: { select: { likes: true } },
        likes: { where: { userId: uid }, select: { id: true } },
      },
    }),
  ]);

  // 批量查作者名（项目惯例：不声明 User 关系，手动关联）
  const authorIds = [...new Set(feed.map((c) => c.userId))];
  const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } });
  const nameMap = new Map(authors.map((u) => [u.id, u.name]));

  type Shaped = {
    id: bigint; userId: string; style: string; inputText: string; outputText: string; createdAt: Date;
    likes: unknown[]; _count: { likes: number };
  };
  const shape = (c: Shaped) => ({
    id: String(c.id),
    style: c.style,
    excerpt: c.inputText.slice(0, 60),
    content: c.outputText,
    author: nameMap.get(c.userId) || '佚名',
    isMine: c.userId === uid,
    createdAt: c.createdAt.toISOString(),
    likes: c._count.likes,
    likedByMe: c.likes.length > 0,
  });

  return Response.json({
    mine: mine.map(shape),
    feed: feed.map(shape),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  const { action, creationId } = (await req.json()) as { action?: string; creationId?: string };
  if (!action || !creationId) return Response.json({ error: '缺少参数' }, { status: 400 });
  let cid: bigint;
  try {
    cid = BigInt(creationId);
  } catch {
    return Response.json({ error: 'creationId 非法' }, { status: 400 });
  }

  const creation = await prisma.creation.findUnique({ where: { id: cid } });
  if (!creation) return Response.json({ error: '创作不存在' }, { status: 404 });

  if (action === 'publish' || action === 'unpublish') {
    // 仅本人可发布/取消发布
    if (creation.userId !== uid) return Response.json({ error: '只能操作自己的作品' }, { status: 403 });
    const updated = await prisma.creation.update({
      where: { id: cid },
      data: { isPublic: action === 'publish' },
      include: { _count: { select: { likes: true } } },
    });
    return Response.json({ isPublic: updated.isPublic, likes: updated._count.likes });
  }

  if (action === 'like') {
    // 仅公开作品可点赞
    if (!creation.isPublic) return Response.json({ error: '该作品未发布' }, { status: 403 });
    const liked = await prisma.creationLike.findUnique({
      where: { creationId_userId: { creationId: cid, userId: uid } },
    });
    if (liked) {
      await prisma.creationLike.delete({ where: { id: liked.id } });
    } else {
      await prisma.creationLike.create({ data: { creationId: cid, userId: uid } });
    }
    const likes = await prisma.creationLike.count({ where: { creationId: cid } });
    return Response.json({ likedByMe: !liked, likes });
  }

  return Response.json({ error: '未知操作' }, { status: 400 });
}
