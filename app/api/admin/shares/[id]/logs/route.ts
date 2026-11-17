import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { ensureShareSchema } from '@/lib/shareReviewLog';

export const dynamic = 'force-dynamic';

/** 单个作品的分享审核时间线 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });
  await ensureShareSchema();

  const { id } = await params;
  let cid: bigint;
  try {
    cid = BigInt(id);
  } catch {
    return Response.json({ error: 'id 非法' }, { status: 400 });
  }

  const rows = await prisma.creationReviewLog.findMany({
    where: { creationId: cid },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  return Response.json({
    items: rows.map((r) => ({
      id: String(r.id),
      action: r.action,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      operatorName: r.operatorName,
      actorRole: r.actorRole,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
