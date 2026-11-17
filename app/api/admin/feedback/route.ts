import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { sendNotification, NOTIF_TYPE } from '@/lib/notification';

export const dynamic = 'force-dynamic';

/** F16 反馈处理：列表（按状态筛选 + 分页） */
export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'open';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const size = Math.min(50, Math.max(5, Number(url.searchParams.get('size')) || 10));

  const where: Record<string, unknown> = {};
  if (status === 'open' || status === 'resolved') where.status = status;

  const [total, rows] = await Promise.all([
    prisma.feedback.count({ where }),
    prisma.feedback.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * size, take: size }),
  ]);

  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, name: true, email: true },
  });
  const nameMap = new Map(authors.map((u) => [u.id, { name: u.name || '佚名', email: u.email }]));

  return Response.json({
    items: rows.map((f) => ({
      id: String(f.id), type: f.type, content: f.content, contact: f.contact,
      reply: f.reply, status: f.status,
      user: nameMap.get(f.userId) || { name: '佚名', email: '-' },
      createdAt: f.createdAt.toISOString(),
    })),
    total, page, size,
  });
}

/** F16 反馈处理：回复 / 修改回复 / 重新打开 / 删除 */
export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const { id, reply, action } = (await req.json()) as { id?: string; reply?: string; action?: string };
  if (!id) return Response.json({ error: '缺少反馈 id' }, { status: 400 });
  const op = action || 'reply';
  if (!['reply', 'reopen', 'delete'].includes(op)) return Response.json({ error: '未知操作' }, { status: 400 });

  const text = reply?.trim();
  if (op === 'reply' && !text) return Response.json({ error: '请填写回复内容' }, { status: 400 });

  let fid: bigint;
  try {
    fid = BigInt(id);
  } catch {
    return Response.json({ error: 'id 非法' }, { status: 400 });
  }
  const exist = await prisma.feedback.findUnique({ where: { id: fid }, select: { id: true, userId: true, type: true, content: true } });
  if (!exist) return Response.json({ error: '反馈不存在' }, { status: 404 });

  if (op === 'delete') {
    await prisma.feedback.delete({ where: { id: fid } });
    return Response.json({ ok: true, deleted: true });
  }

  // 重新打开保留上一次回复作为参考，管理员可在待处理列表里直接改后再次回复
  const updated = await prisma.feedback.update({
    where: { id: fid },
    data: op === 'reopen'
      ? { status: 'open' }
      : { reply: text, status: 'resolved' },
  });

  // 通知反馈提交者
  if (op === 'reply' && text) {
    const preview = (exist.content || '').slice(0, 40);
    sendNotification(
      exist.userId, NOTIF_TYPE.FEEDBACK_REPLY,
      '📬 你的反馈已有回复',
      `你关于"${preview}"的反馈，管理员回复：${text.slice(0, 200)}`,
      '/workbench',
    );
  }

  return Response.json({ id: String(updated.id), status: updated.status, reply: updated.reply });
}
