import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

/** F3 个人中心：修改密码（需验证旧密码） */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const { oldPassword, newPassword } = (await req.json()) as { oldPassword?: string; newPassword?: string };
  if (!oldPassword || !newPassword) return Response.json({ error: '请填写完整' }, { status: 400 });
  if (newPassword.length < 6 || newPassword.length > 32) {
    return Response.json({ error: '新密码长度需为 6-32 位' }, { status: 400 });
  }
  if (newPassword === oldPassword) {
    return Response.json({ error: '新密码不能与旧密码相同' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return Response.json({ error: '用户不存在' }, { status: 404 });

  const ok = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!ok) return Response.json({ error: '旧密码不正确' }, { status: 400 });

  const hash = await bcrypt.hash(newPassword, 10);
  // 改密时间戳：旧会话全部失效，前端收到 reLogin 后引导重新登录
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash, passwordChangedAt: new Date() } });
  return Response.json({ ok: true, reLogin: true });
}
