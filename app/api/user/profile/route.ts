import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

/** F3 个人中心：昵称修改 */
async function PUT_impl(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const { name } = (await req.json()) as { name?: string };
  const trimmed = name?.trim();
  if (!trimmed || trimmed.length < 1 || trimmed.length > 20) {
    return Response.json({ error: '昵称需为 1-20 个字符' }, { status: 400 });
  }

  await prisma.user.update({ where: { id: session.user.id }, data: { name: trimmed } });
  return Response.json({ ok: true, name: trimmed });
}

export const PUT = withApi(PUT_impl);
