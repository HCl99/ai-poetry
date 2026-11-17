import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { findSensitiveWords } from '@/lib/community';
import { isPostCategory } from '@/lib/postCategories';
import { POST_STATUS, initialPostStatus } from '@/lib/postWorkflow';
import { withApi } from '@/lib/apiHandler';
import { REVIEW_ACTION } from '@/lib/postReviewMeta';
import { writeReviewLog } from '@/lib/postReviewLog';

export const dynamic = 'force-dynamic';

/** 学习社区：帖子流（全部已通过 + 作者自己各状态的投稿），支持分类筛选与分页 */
async function GET_impl(req: Request) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get('category')?.trim() || '';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const size = Math.min(20, Math.max(5, Number(url.searchParams.get('size')) || 10));

  // 公开可见的已通过帖子 + 本人所有非公开投稿（待审 / 未通过 / 已撤回）
  const where: Record<string, unknown> = {
    OR: [
      { status: POST_STATUS.APPROVED },
      { userId: uid, status: { in: [POST_STATUS.PENDING, POST_STATUS.REJECTED, POST_STATUS.WITHDRAWN] } },
    ],
  };
  // 分类由管理端运行时维护，不能用编译期常量校验，否则新增分类永远筛不出来
  if (category && (await isPostCategory(category))) where.category = category;

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
      // 审核信息只回给作者本人，不泄露给其他用户
      reviewNote: p.userId === uid ? p.reviewNote : null,
      flagReason: p.userId === uid ? p.flagReason : null,
      comments: cMap.get(p.id) || 0, likes: lMap.get(p.id) || 0,
      likedByMe: likedSet.has(p.id),
      createdAt: p.createdAt.toISOString(),
    })),
    total, page, size,
  });
}

/** 学习社区：发帖（一律先审后发；命中敏感词必送审，管理员正常内容免审） */
async function POST_impl(req: Request) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  const { title, content, category } = (await req.json()) as { title?: string; content?: string; category?: string };
  const t = title?.trim();
  const c = content?.trim();
  if (!t || t.length < 2 || t.length > 60) return Response.json({ error: '标题需为 2-60 字' }, { status: 400 });
  if (!c || c.length < 5 || c.length > 2000) return Response.json({ error: '正文需为 5-2000 字' }, { status: 400 });
  if (!category || !(await isPostCategory(category))) {
    return Response.json({ error: '请选择有效分类' }, { status: 400 });
  }

  const flagged = findSensitiveWords(`${t}\n${c}`);
  const status = initialPostStatus(session?.user?.role, flagged.length > 0);
  const post = await prisma.post.create({
    data: {
      userId: uid, title: t, content: c, category,
      status,
      flagReason: flagged.length ? `敏感词：${flagged.join('、')}` : null,
    },
  });
  await writeReviewLog({
    postId: post.id, postTitle: t, action: REVIEW_ACTION.SUBMIT,
    toStatus: status,
    operatorId: uid,
    operatorName: session?.user?.name || session?.user?.email || '诗友',
    actorRole: session?.user?.role === 'admin' ? 'admin' : 'user',
    note: flagged.length
      ? `敏感词自动标记：${flagged.join('、')}`
      : (status === POST_STATUS.APPROVED ? '管理员发布，免审直接通过' : null),
  });
  return Response.json({ id: String(post.id), status: post.status, flagged: flagged.length > 0 });
}

export const GET = withApi(GET_impl);
export const POST = withApi(POST_impl);
