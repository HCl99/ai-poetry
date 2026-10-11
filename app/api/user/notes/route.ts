import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const rows = await prisma.note.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return Response.json(
    rows.map((r) => ({
      id: r.id.toString(),
      title: r.title ?? '笔记',
      content: r.content,
      time: r.createdAt.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    })),
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const { title, content, poemId } = (await req.json()) as { title?: string; content?: string; poemId?: string };
  if (!content) return Response.json({ error: '内容不能为空' }, { status: 400 });
  const note = await prisma.note.create({
    data: { userId: session.user.id, title, content, poemId },
  });
  return Response.json({ ok: true, id: note.id.toString() });
}
