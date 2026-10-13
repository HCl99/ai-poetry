import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { FEEDBACK_TYPES } from '@/lib/community';

export const dynamic = 'force-dynamic';

/** F3 个人中心：提交意见反馈 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const { type, content, contact } = (await req.json()) as { type?: string; content?: string; contact?: string };
  if (!type || !(FEEDBACK_TYPES as readonly string[]).includes(type)) {
    return Response.json({ error: '请选择反馈类型' }, { status: 400 });
  }
  const text = content?.trim();
  if (!text || text.length < 5 || text.length > 500) {
    return Response.json({ error: '反馈内容需为 5-500 字' }, { status: 400 });
  }

  const rec = await prisma.feedback.create({
    data: {
      userId: session.user.id,
      type,
      content: text,
      contact: contact?.trim().slice(0, 64) || null,
    },
  });
  return Response.json({ ok: true, id: String(rec.id) });
}

/** F3 个人中心：我的反馈历史（含管理员回复） */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const rows = await prisma.feedback.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return Response.json({
    items: rows.map((r) => ({
      id: String(r.id),
      type: r.type,
      content: r.content,
      status: r.status,
      reply: r.reply,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
