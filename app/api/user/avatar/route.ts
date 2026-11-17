import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

// 头像存 DataURL（前端 canvas 压缩到 128×128 JPEG，约 5-15KB）
const AVATAR_PREFIX = /^data:image\/(png|jpeg|jpg|webp);base64,/;
const AVATAR_MAX_CHARS = 300_000; // 约 220KB 原始体积

/** F3 个人中心：头像上传（DataURL 存储） */
async function PUT_impl(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const { avatar } = (await req.json()) as { avatar?: string | null };

  // 传 null 表示恢复默认头像
  if (avatar === null) {
    await prisma.user.update({ where: { id: session.user.id }, data: { avatar: null } });
    return Response.json({ ok: true });
  }

  if (!avatar || !AVATAR_PREFIX.test(avatar)) {
    return Response.json({ error: '仅支持 PNG / JPEG / WebP 图片' }, { status: 400 });
  }
  if (avatar.length > AVATAR_MAX_CHARS) {
    return Response.json({ error: '图片过大，请选择较小的图片' }, { status: 400 });
  }

  await prisma.user.update({ where: { id: session.user.id }, data: { avatar } });
  return Response.json({ ok: true });
}

export const PUT = withApi(PUT_impl);
