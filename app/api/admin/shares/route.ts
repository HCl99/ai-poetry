import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { REVIEW_ACTION } from '@/lib/postReviewMeta';
import { ensureShareSchema, writeShareReviewLog } from '@/lib/shareReviewLog';
import {
  SHARE_STATUS, SHARE_STATUS_LABEL, isShareStatus, shareTitle,
} from '@/lib/shareWorkflow';
import { sendNotification, NOTIF_TYPE } from '@/lib/notification';

export const dynamic = 'force-dynamic';

/** 作品审核：列表（按分享状态筛选 + 分页） */
export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });
  await ensureShareSchema();

  const url = new URL(req.url);
  const rawStatus = url.searchParams.get('status') || SHARE_STATUS.PENDING;
  const status = isShareStatus(rawStatus) ? rawStatus : SHARE_STATUS.PENDING;
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const size = Math.min(50, Math.max(5, Number(url.searchParams.get('size')) || 10));

  const where = { shareStatus: status };
  const [total, rows] = await Promise.all([
    prisma.creation.count({ where }),
    prisma.creation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
  ]);

  const ids = rows.map((r) => r.id);
  const [authors, likeCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { id: true, name: true, email: true },
    }),
    ids.length
      ? prisma.creationLike.groupBy({ by: ['creationId'], where: { creationId: { in: ids } }, _count: { _all: true } })
      : [],
  ]);
  const nameMap = new Map(authors.map((u) => [u.id, u.name || u.email]));
  const likeMap = new Map(likeCounts.map((l) => [l.creationId, l._count._all]));

  return Response.json({
    items: rows.map((c) => ({
      id: String(c.id),
      title: shareTitle(c.style, c.outputText),
      style: c.style,
      excerpt: c.inputText.slice(0, 60),
      content: c.outputText,
      status: c.shareStatus,
      statusLabel: SHARE_STATUS_LABEL[c.shareStatus] || c.shareStatus,
      flagReason: c.shareFlagReason,
      reviewNote: c.shareReviewNote,
      author: nameMap.get(c.userId) || '佚名',
      likes: likeMap.get(c.id) || 0,
      createdAt: c.createdAt.toISOString(),
      sharedAt: c.sharedAt?.toISOString() || null,
      reviewedAt: c.reviewedAt?.toISOString() || null,
    })),
    total, page, size,
  });
}

/** 作品审核：通过 / 拒绝 / 下架 / 删除；作者已撤回的作品不可再审批 */
export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });
  await ensureShareSchema();

  const { id, action, note } = (await req.json()) as { id?: string; action?: string; note?: string };
  if (!id) return Response.json({ error: '缺少作品 id' }, { status: 400 });
  let cid: bigint;
  try {
    cid = BigInt(id);
  } catch {
    return Response.json({ error: 'id 非法' }, { status: 400 });
  }

  const creation = await prisma.creation.findUnique({
    where: { id: cid },
    select: { id: true, style: true, outputText: true, shareStatus: true, userId: true },
  });
  if (!creation) return Response.json({ error: '作品不存在' }, { status: 404 });
  const title = shareTitle(creation.style, creation.outputText);
  const operatorName = session.user.name || session.user.email || '管理员';

  if (action === 'approve') {
    if (creation.shareStatus !== SHARE_STATUS.PENDING && creation.shareStatus !== SHARE_STATUS.REJECTED) {
      return Response.json({ error: '只有待审核或已拒绝的作品可以通过' }, { status: 409 });
    }
    const now = new Date();
    const r = await prisma.creation.updateMany({
      where: { id: cid, shareStatus: { in: [SHARE_STATUS.PENDING, SHARE_STATUS.REJECTED] } },
      data: {
        shareStatus: SHARE_STATUS.APPROVED,
        isPublic: true,
        shareReviewNote: note?.trim() || null,
        reviewedAt: now,
      },
    });
    if (r.count === 0) return Response.json({ error: '作品状态已变化，请刷新后重试' }, { status: 409 });
    await writeShareReviewLog({
      creationId: cid, creationTitle: title,
      action: REVIEW_ACTION.APPROVE,
      fromStatus: creation.shareStatus, toStatus: SHARE_STATUS.APPROVED,
      operatorId: session.user.id, operatorName, actorRole: 'admin',
      note: note?.trim() || null,
    });
    sendNotification(
      creation.userId, NOTIF_TYPE.SHARE_APPROVED,
      `🎉 你的作品已通过审核`, `《${title}》已被管理员通过，现已展示在作品广场`,
      '/workbench/community',
    );
    return Response.json({ id: String(cid), status: SHARE_STATUS.APPROVED });
  }

  if (action === 'reject' || action === 'takedown') {
    if (!note?.trim()) return Response.json({ error: '请填写审核备注，便于作者修改' }, { status: 400 });
    const from = action === 'reject' ? SHARE_STATUS.PENDING : SHARE_STATUS.APPROVED;
    if (creation.shareStatus !== from) {
      return Response.json({ error: action === 'reject' ? '只有待审核作品可以拒绝' : '只有已发布作品可以下架' }, { status: 409 });
    }
    const r = await prisma.creation.updateMany({
      where: { id: cid, shareStatus: from },
      data: {
        shareStatus: SHARE_STATUS.REJECTED,
        isPublic: false,
        shareReviewNote: note.trim(),
        reviewedAt: new Date(),
      },
    });
    if (r.count === 0) return Response.json({ error: '作品状态已变化，请刷新后重试' }, { status: 409 });
    await writeShareReviewLog({
      creationId: cid, creationTitle: title,
      action: action === 'reject' ? REVIEW_ACTION.REJECT : REVIEW_ACTION.TAKEDOWN,
      fromStatus: from, toStatus: SHARE_STATUS.REJECTED,
      operatorId: session.user.id, operatorName, actorRole: 'admin',
      note: note.trim(),
    });
    sendNotification(
      creation.userId,
      action === 'reject' ? NOTIF_TYPE.SHARE_REJECTED : NOTIF_TYPE.SHARE_TAKEDOWN,
      action === 'reject' ? `📝 你的作品未通过审核` : `⚠️ 你的作品已被下架`,
      `《${title}》${action === 'reject' ? '未通过审核' : '已被下架'}：${note.trim()}`,
      '/workbench/community',
    );
    return Response.json({ id: String(cid), status: SHARE_STATUS.REJECTED });
  }

  if (action === 'delete') {
    await writeShareReviewLog({
      creationId: cid, creationTitle: title,
      action: REVIEW_ACTION.DELETE,
      fromStatus: creation.shareStatus,
      operatorId: session.user.id, operatorName, actorRole: 'admin',
      note: note?.trim() || '作品及其点赞一并删除',
    });
    await prisma.creationLike.deleteMany({ where: { creationId: cid } });
    await prisma.creation.delete({ where: { id: cid } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: '未知操作' }, { status: 400 });
}
