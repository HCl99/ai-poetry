import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** F11 数据统计：管理后台总览 */
export async function GET() {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const [
    users, admins, disabledUsers,
    poems, annotations, poets,
    postsPending, postsApproved, comments,
    feedbackOpen, creations, favorites,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'admin' } }),
    prisma.user.count({ where: { status: 'disabled' } }),
    prisma.poem.count(),
    prisma.annotation.count(),
    prisma.poetBio.count(),
    prisma.post.count({ where: { status: 'pending' } }),
    prisma.post.count({ where: { status: 'approved' } }),
    prisma.comment.count(),
    prisma.feedback.count({ where: { status: 'open' } }),
    prisma.creation.count(),
    prisma.favorite.count(),
  ]);

  const [pendingPosts, recentUsers] = await Promise.all([
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
  ]);

  const authorIds = [...new Set(pendingPosts.map((p) => p.userId))];
  const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } });
  const nameMap = new Map(authors.map((u) => [u.id, u.name || u.email]));

  return Response.json({
    metrics: { users, admins, disabledUsers, poems, annotations, poets, postsPending, postsApproved, comments, feedbackOpen, creations, favorites },
    pendingPosts: pendingPosts.map((p) => ({
      id: String(p.id), title: p.title, category: p.category, flagReason: p.flagReason,
      author: nameMap.get(p.userId) || '佚名', createdAt: p.createdAt.toISOString(),
    })),
    recentUsers: recentUsers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
  });
}
