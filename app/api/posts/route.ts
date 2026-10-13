import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { POST_CATEGORIES, findSensitiveWords } from '@/lib/community';

export const dynamic = 'force-dynamic';

/** 学习社区：帖子流（已通过 + 自己的待审核），支持分类筛选与分页 */
export async function GET(req: Request) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get('category')?.trim() || '';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const size = Math.min(20, Math.max(5, Number(url.searchParams.get('size')) || 10));

  const where: Record<string, unknown> = {
    OR: [{ status: 'approved' }, { status: 'pending', userId: uid }],
  };
  if (category && (POST_CATEGORIES as readonly string[]).includes(category)) where.category = category;

  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * size, take: size }),
  ]);

  const postIds = rows.map((r) => r.id);
  const [authors, cCounts, lCounts, myLikes] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } }),
    postIds.length ? prisma.comment.groupBy({ by: ['postId'], where: { postId: { in: postIds } }, _count: { _all: true } }) : [],
    postIds.length ? prisma.postLike.groupBy({ by: ['postId'], where: { postId: { in: postIds } }, _count: { _all: true } }) : [],
    prisma.postLike.findMany({ where: { userId: uid, postId: { in: postIds } }, select: { postId: true } }),
  ]);
  const nameMap = new Map(authors.map((u) => [u.id, u.name || '诗友']));
  const cMap = new Map(cCounts.map((c) => [c.postId, c._count._all]));
  const lMap = new Map(lCounts.map((l) => [l.postId, l._count._all]));
  const likedSet = new Set(myLikes.map((l) => l.postId));

  return Response.json({
    items: rows.map((p) => ({
      id: String(p.id), title: p.title, content: p.content, category: p.category,
      status: p.status, isMine: p.userId === uid,
      author: nameMap.get(p.userId) || '诗友',
      comments: cMap.get(p.id) || 0, likes: lMap.get(p.id) || 0,
      likedByMe: likedSet.has(p.id),
      createdAt: p.createdAt.toISOString(),
    })),
    total, page, size,
  });
}

/** 学习社区：发帖（命中敏感词自动转入人工审核） */
export async function POST(req: Request) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  const { title, content, category } = (await req.json()) as { title?: string; content?: string; category?: string };
  const t = title?.trim();
  const c = content?.trim();
  if (!t || t.length < 2 || t.length > 60) return Response.json({ error: '标题需为 2-60 字' }, { status: 400 });
  if (!c || c.length < 5 || c.length > 2000) return Response.json({ error: '正文需为 5-2000 字' }, { status: 400 });
  if (!category || !(POST_CATEGORIES as readonly string[]).includes(category)) {
    return Response.json({ error: '请选择有效分类' }, { status: 400 });
  }

  const flagged = findSensitiveWords(`${t}\n${c}`);
  const post = await prisma.post.create({
    data: {
      userId: uid, title: t, content: c, category,
      status: flagged.length ? 'pending' : 'approved',
      flagReason: flagged.length ? `敏感词：${flagged.join('、')}` : null,
    },
  });
  return Response.json({ id: String(post.id), status: post.status, flagged: flagged.length > 0 });
}
