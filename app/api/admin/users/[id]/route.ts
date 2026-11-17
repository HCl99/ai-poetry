import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

/** F12 用户管理：单个用户的真实活跃数据（列表页详情弹窗） */
async function GET_impl(_req: Request, ctx: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const id = ctx.params.id;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
  });
  if (!user) return Response.json({ error: '用户不存在' }, { status: 404 });

  const [posts, comments, creations, favorites, feedbacks, recentPosts] = await Promise.all([
    prisma.post.count({ where: { userId: id } }),
    prisma.comment.count({ where: { userId: id } }),
    prisma.creation.count({ where: { userId: id } }),
    prisma.favorite.count({ where: { userId: id } }),
    prisma.feedback.count({ where: { userId: id } }),
    prisma.post.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, status: true, category: true, createdAt: true },
    }),
  ]);

  return Response.json({
    user: { ...user, createdAt: user.createdAt.toISOString(), isSelf: id === session.user.id },
    activity: { posts, comments, creations, favorites, feedbacks },
    recentPosts: recentPosts.map((p) => ({
      id: String(p.id), title: p.title, status: p.status, category: p.category,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}

export const GET = withApi(GET_impl);
