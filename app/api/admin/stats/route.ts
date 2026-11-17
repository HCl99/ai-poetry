import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';
import { ensureShareSchema } from '@/lib/shareReviewLog';
import { SHARE_STATUS } from '@/lib/shareWorkflow';

export const dynamic = 'force-dynamic';

/** F11 数据统计：管理后台总览 */
async function GET_impl() {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });
  await ensureShareSchema();

  const [
    users, admins, disabledUsers,
    poems, annotations, poets,
    postsPending, postsApproved, postsWithdrawn, comments,
    feedbackOpen, creations, favorites, sharesPending,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'admin' } }),
    prisma.user.count({ where: { status: 'disabled' } }),
    prisma.poem.count(),
    prisma.annotation.count(),
    prisma.poetBio.count(),
    prisma.post.count({ where: { status: 'pending' } }),
    prisma.post.count({ where: { status: 'approved' } }),
    prisma.post.count({ where: { status: 'withdrawn' } }),
    prisma.comment.count(),
    prisma.feedback.count({ where: { status: 'open' } }),
    prisma.creation.count(),
    prisma.favorite.count(),
    prisma.creation.count({ where: { shareStatus: SHARE_STATUS.PENDING } }),
  ]);

  const [pendingPosts, recentUsers, recentFeedback] = await Promise.all([
    prisma.post.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, category: true, flagReason: true, userId: true, createdAt: true },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
    }),
    prisma.feedback.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, type: true, content: true, contact: true, createdAt: true },
    }),
  ]);

  const authorIds = [...new Set(pendingPosts.map((p) => p.userId))];
  const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } });
  const nameMap = new Map(authors.map((u) => [u.id, u.name || u.email]));

  return Response.json({
    metrics: { users, admins, disabledUsers, poems, annotations, poets, postsPending, postsApproved, postsWithdrawn, comments, feedbackOpen, creations, favorites, sharesPending },
    pendingPosts: pendingPosts.map((p) => ({
      id: String(p.id), title: p.title, category: p.category, flagReason: p.flagReason,
      author: nameMap.get(p.userId) || '佚名', createdAt: p.createdAt.toISOString(),
    })),
    recentUsers: recentUsers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    recentFeedback: recentFeedback.map((f) => ({
      id: String(f.id), type: f.type, content: f.content, contact: f.contact,
      createdAt: f.createdAt.toISOString(),
    })),
  });
}

export const GET = withApi(GET_impl);
