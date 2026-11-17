import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { ensureReviewLogTable } from '@/lib/postReviewLog';

export const dynamic = 'force-dynamic';

/** F15 帖子审核：操作历史（审核记录）列表，可按帖子 id 过滤查看单帖时间线 */
export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const size = Math.min(50, Math.max(5, Number(url.searchParams.get('size')) || 10));
  const rawPostId = url.searchParams.get('postId');
  let postId: bigint | undefined;
  if (rawPostId) {
    try {
      postId = BigInt(rawPostId);
    } catch {
      return Response.json({ error: 'postId 非法' }, { status: 400 });
    }
  }
  const where = postId === undefined ? {} : { postId };

  // 兼容只导入旧版 sql 的评审环境：表不存在时幂等补建
  await ensureReviewLogTable();
  const [total, rows] = await Promise.all([
    prisma.postReviewLog.count({ where }),
    prisma.postReviewLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * size,
      take: size,
    }),
  ]);

  return Response.json({
    items: rows.map((r) => ({
      id: String(r.id),
      postId: String(r.postId),
      postTitle: r.postTitle,
      action: r.action,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      operatorName: r.operatorName,
      actorRole: r.actorRole,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
    total, page, size,
  });
}
