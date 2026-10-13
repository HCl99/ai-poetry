import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** F15 帖子审核：列表（按状态筛选 + 分页，含评论/点赞数与敏感标记） */
export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'pending';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const size = Math.min(50, Math.max(5, Number(url.searchParams.get('size')) || 10));

  const where: Record<string, unknown> = {};
  if (status === 'pending' || status === 'approved' || status === 'rejected') where.status = status;

  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
  ]);

  // 项目惯例：不声明关系，手动批量查作者名与评论/点赞计数
  const postIds = rows.map((r) => r.id);
  const [authors, cCounts, lCounts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true, email: true } }),
    postIds.length ? prisma.comment.groupBy({ by: ['postId'], where: { postId: { in: postIds } }, _count: { _all: true } }) : [],
    postIds.length ? prisma.postLike.groupBy({ by: ['postId'], where: { postId: { in: postIds } }, _count: { _all: true } }) : [],
  ]);
  const nameMap = new Map(authors.map((u) => [u.id, u.name || u.email]));
  const cMap = new Map(cCounts.map((c) => [c.postId, c._count._all]));
  const lMap = new Map(lCounts.map((l) => [l.postId, l._count._all]));

  return Response.json({
    items: rows.map((p) => ({
      id: String(p.id), title: p.title, content: p.content, category: p.category,
      status: p.status, flagReason: p.flagReason, reviewNote: p.reviewNote,
      author: nameMap.get(p.userId) || '佚名',
      comments: cMap.get(p.id) || 0, likes: lMap.get(p.id) || 0,
      createdAt: p.createdAt.toISOString(),
    })),
    total, page, size,
  });
}

/** F15 帖子审核：通过 / 拒绝（附审核备注）/ 删除 */
export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const { id, action, note } = (await req.json()) as { id?: string; action?: string; note?: string };
  if (!id) return Response.json({ error: '缺少帖子 id' }, { status: 400 });
  let pid: bigint;
  try {
    pid = BigInt(id);
  } catch {
    return Response.json({ error: 'id 非法' }, { status: 400 });
  }

  const post = await prisma.post.findUnique({ where: { id: pid }, select: { id: true } });
  if (!post) return Response.json({ error: '帖子不存在' }, { status: 404 });

  if (action === 'approve' || action === 'reject') {
    if (action === 'reject' && !note?.trim()) return Response.json({ error: '拒绝时请填写审核备注' }, { status: 400 });
    const updated = await prisma.post.update({
      where: { id: pid },
      data: { status: action === 'approve' ? 'approved' : 'rejected', reviewNote: note?.trim() || null },
    });
    return Response.json({ id: String(updated.id), status: updated.status });
  }

  if (action === 'delete') {
    await prisma.comment.deleteMany({ where: { postId: pid } });
    await prisma.postLike.deleteMany({ where: { postId: pid } });
    await prisma.post.delete({ where: { id: pid } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: '未知操作' }, { status: 400 });
}
