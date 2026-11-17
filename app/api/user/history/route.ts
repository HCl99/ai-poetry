import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

const COLOR: Record<string, string> = {
  read: '#7B8EA1',
  annotate: '#6B8E7B',
  transfer: '#8B7355',
  favorite: '#A67C7C',
  imagery: '#C4A965',
  recite: '#9C9487',
  quiz: '#A67C7C',
  feihua: '#7B8EA1',
  assistant: '#5D5853',
};

const TYPE_LABEL: Record<string, string> = {
  read: '阅读',
  annotate: 'AI注解',
  transfer: '风格迁移',
  favorite: '收藏',
  imagery: '浏览意象',
  recite: '背诵闯关',
  quiz: '诗词测验',
  feihua: '飞花令',
  assistant: 'AI助手',
};

/** 根据 actionType + targetId 生成可跳转的详情路径 */
function hrefOf(actionType: string, targetId: string | null): string | null {
  if (!targetId) return null;
  switch (actionType) {
    case 'read':
    case 'annotate':
    case 'favorite':
      return `/workbench/poem/${targetId}`;
    case 'transfer':
      return '/workbench/transfer';
    case 'recite':
      return '/workbench/recite';
    case 'quiz':
      return '/workbench/quiz';
    case 'feihua':
      return '/workbench/feihua';
    case 'assistant':
      return '/workbench/assistant';
    case 'imagery':
      return `/workbench/imagery?focus=${encodeURIComponent(targetId)}`;
    default:
      return null;
  }
}

async function GET_impl() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const rows = await prisma.history.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return Response.json(
    rows.map((r) => {
      const label = TYPE_LABEL[r.actionType] ?? '消息';
      const title = (r.title && r.title.trim()) ? r.title : label;
      return {
        id: r.id.toString(),
        type: r.actionType,
        typeLabel: label,
        title,
        desc: r.detail ?? '',
        time: r.createdAt.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        color: COLOR[r.actionType] ?? '#6B8E7B',
        isRead: r.isRead,
        href: hrefOf(r.actionType, r.targetId),
      };
    }),
  );
}

/** 标记已读：body { id?: string } 传 id 标记单条，不传标记全部 */
async function POST_impl(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  let body: { id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body.id) {
    await prisma.history.updateMany({
      where: { id: BigInt(body.id), userId: session.user.id, isRead: false },
      data: { isRead: true },
    });
  } else {
    await prisma.history.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });
  }
  return Response.json({ ok: true });
}

export const GET = withApi(GET_impl);
export const POST = withApi(POST_impl);
