import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { POST_STATUS, canReview, isPostStatus, reviewTarget } from '@/lib/postWorkflow';
import { REVIEW_ACTION } from '@/lib/postReviewMeta';
import { writeReviewLog } from '@/lib/postReviewLog';
import { sendNotification, NOTIF_TYPE } from '@/lib/notification';

export const dynamic = 'force-dynamic';

/** F15 帖子审核：列表（按状态筛选 + 分页，含评论/点赞数与敏感标记） */
export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const url = new URL(req.url);
  const rawStatus = url.searchParams.get('status') || 'pending';
  const status = isPostStatus(rawStatus) ? rawStatus : POST_STATUS.PENDING;
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const size = Math.min(50, Math.max(5, Number(url.searchParams.get('size')) || 10));

  // 白名单外的取值一律回落到 pending，避免非法参数导致返回全部状态的数据
  const where = { status };

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

/** F15 帖子审核：通过 / 拒绝（附审核备注）/ 删除；作者已撤回的投稿不可再审批 */
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

  const post = await prisma.post.findUnique({ where: { id: pid }, select: { id: true, status: true, title: true, userId: true } });
  if (!post) return Response.json({ error: '帖子不存在' }, { status: 404 });
  const operatorName = session.user.name || session.user.email || '管理员';

  if (action === 'approve' || action === 'reject') {
    if (action === 'reject' && !note?.trim()) return Response.json({ error: '拒绝时请填写审核备注' }, { status: 400 });
    if (!canReview(post.status)) {
      return Response.json({ error: '该投稿已被作者撤回，不可再次审批，仅可删除' }, { status: 409 });
    }
    const target = reviewTarget(action);
    // 条件更新保证「撤回优先」：若用户恰好在此期间撤回，审批不会把它重新放出
    const r = await prisma.post.updateMany({
      where: { id: pid, status: { not: POST_STATUS.WITHDRAWN } },
      data: { status: target, reviewNote: note?.trim() || null },
    });
    if (r.count === 0) return Response.json({ error: '该投稿刚被作者撤回，请刷新后重试' }, { status: 409 });
    await writeReviewLog({
      postId: pid, postTitle: post.title,
      action: action === 'approve' ? REVIEW_ACTION.APPROVE : REVIEW_ACTION.REJECT,
      fromStatus: post.status, toStatus: target,
      operatorId: session.user.id, operatorName, actorRole: 'admin',
      note: note?.trim() || null,
    });
    // 通知作者
    const title = action === 'approve' ? '🎉 你的帖子已通过审核' : '📝 你的帖子未通过审核';
    const body = action === 'approve'
      ? `《${post.title}》已被管理员通过，现已公开展示`
      : `《${post.title}》未通过审核${note ? `：${note.trim()}` : ''}`;
    const link = '/workbench/community';
    sendNotification(
      post.userId,
      action === 'approve' ? NOTIF_TYPE.POST_APPROVED : NOTIF_TYPE.POST_REJECTED,
      title, body, link,
    );
    return Response.json({ id: String(pid), status: target });
  }

  if (action === 'delete') {
    // 先留痕再删帖：日志表不设外键，帖子删除后这条历史依然可查
    await writeReviewLog({
      postId: pid, postTitle: post.title, action: REVIEW_ACTION.DELETE,
      fromStatus: post.status,
      operatorId: session.user.id, operatorName, actorRole: 'admin',
      note: note?.trim() || '帖子及其评论、点赞一并删除',
    });
    await prisma.comment.deleteMany({ where: { postId: pid } });
    await prisma.postLike.deleteMany({ where: { postId: pid } });
    await prisma.post.delete({ where: { id: pid } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: '未知操作' }, { status: 400 });
}
