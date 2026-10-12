import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const COLOR: Record<string, string> = {
  read: '#7B8EA1',
  annotate: '#6B8E7B',
  transfer: '#8B7355',
  favorite: '#A67C7C',
  imagery: '#C4A965',
  recite: '#9C9487',
};

const TYPE_LABEL: Record<string, string> = {
  read: '阅读',
  annotate: 'AI注解',
  transfer: '风格迁移',
  favorite: '收藏',
  imagery: '浏览意象',
  recite: '背诵闯关',
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const rows = await prisma.history.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return Response.json(
    rows.map((r) => ({
      id: r.id.toString(),
      type: r.actionType,
      typeLabel: TYPE_LABEL[r.actionType] ?? r.actionType,
      title: r.title ?? TYPE_LABEL[r.actionType] ?? '操作',
      desc: r.detail ?? '',
      time: r.createdAt.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      color: COLOR[r.actionType] ?? '#6B8E7B',
    })),
  );
}
