import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { findSensitiveWords } from '@/lib/community';
import { REVIEW_ACTION } from '@/lib/postReviewMeta';
import { ensureShareSchema, writeShareReviewLog } from '@/lib/shareReviewLog';
import {
  SHARE_STATUS, canPublishShare, canWithdrawShare, initialShareStatus, isShareVisible, shareTitle,
} from '@/lib/shareWorkflow';

export const dynamic = 'force-dynamic';

/** 作品社区：分享流 + 点赞（分享走先审后发） */
export async function GET() {
  await ensureShareSchema();
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
      where: { shareStatus: SHARE_STATUS.APPROVED },
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
    shareStatus: string; shareReviewNote: string | null; shareFlagReason: string | null;
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
    shareStatus: c.shareStatus,
    reviewNote: c.shareReviewNote,
    flagReason: c.shareFlagReason,
    likes: c._count.likes,
    likedByMe: c.likes.length > 0,
  });

  return Response.json({
    mine: mine.map(shape),
    feed: feed.map(shape),
  });
}

export async function POST(req: Request) {
  await ensureShareSchema();
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
  }

  if (action === 'publish') {
    if (!canPublishShare(creation.shareStatus)) {
      return Response.json({ error: '该作品已在审核中或已发布，请勿重复提交' }, { status: 409 });
    }
    // 敏感词命中一律送审；管理员发布正常内容免审
    const flagged = findSensitiveWords(`${creation.style}\n${creation.inputText}\n${creation.outputText}`);
    const target = initialShareStatus(session.user.role, flagged.length > 0);
    const now = new Date();
    const updated = await prisma.creation.updateMany({
      where: { id: cid, shareStatus: creation.shareStatus },
      data: {
        shareStatus: target,
        shareFlagReason: flagged.length ? flagged.join('、') : null,
        shareReviewNote: null,
        sharedAt: now,
        reviewedAt: target === SHARE_STATUS.APPROVED ? now : null,
        isPublic: target === SHARE_STATUS.APPROVED,
      },
    });
    if (updated.count === 0) return Response.json({ error: '作品状态已变化，请刷新后重试' }, { status: 409 });

    await writeShareReviewLog({
      creationId: cid,
      creationTitle: shareTitle(creation.style, creation.outputText),
      action: REVIEW_ACTION.SUBMIT,
      fromStatus: creation.shareStatus,
      toStatus: target,
      operatorId: uid,
      operatorName: session.user.name || session.user.email || '用户',
      actorRole: session.user.role === 'admin' ? 'admin' : 'user',
      note: flagged.length ? `命中敏感词：${flagged.join('、')}` : (target === SHARE_STATUS.APPROVED ? '管理员发布，免审' : null),
    });

    const likes = await prisma.creationLike.count({ where: { creationId: cid } });
    return Response.json({
      shareStatus: target,
      isPublic: target === SHARE_STATUS.APPROVED,
      likes,
    });
  }

  if (action === 'unpublish') {
    if (!canWithdrawShare(creation.shareStatus, creation.userId === uid)) {
      return Response.json({ error: '当前状态不可撤回' }, { status: 409 });
    }
    const updated = await prisma.creation.updateMany({
      where: { id: cid, shareStatus: creation.shareStatus },
      data: { shareStatus: SHARE_STATUS.WITHDRAWN, isPublic: false },
    });
    if (updated.count === 0) return Response.json({ error: '作品状态已变化，请刷新后重试' }, { status: 409 });

    await writeShareReviewLog({
      creationId: cid,
      creationTitle: shareTitle(creation.style, creation.outputText),
      action: REVIEW_ACTION.WITHDRAW,
      fromStatus: creation.shareStatus,
      toStatus: SHARE_STATUS.WITHDRAWN,
      operatorId: uid,
      operatorName: session.user.name || session.user.email || '用户',
      actorRole: session.user.role === 'admin' ? 'admin' : 'user',
    });

    const likes = await prisma.creationLike.count({ where: { creationId: cid } });
    return Response.json({ shareStatus: SHARE_STATUS.WITHDRAWN, isPublic: false, likes });
  }

  if (action === 'like') {
    // 仅审核通过的作品可点赞
    if (!isShareVisible(creation.shareStatus)) return Response.json({ error: '该作品未发布' }, { status: 403 });
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
