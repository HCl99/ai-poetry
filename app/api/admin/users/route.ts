import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** F12 用户管理：列表搜索 + 分页 */
export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const role = url.searchParams.get('role') || '';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const size = Math.min(50, Math.max(5, Number(url.searchParams.get('size')) || 10));

  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ email: { contains: q } }, { name: { contains: q } }];
  if (role === 'admin' || role === 'user') where.role = role;

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
      select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
    }),
  ]);

  return Response.json({
    items: rows.map((u) => ({ ...u, isSelf: u.id === session.user.id, createdAt: u.createdAt.toISOString() })),
    total, page, size,
  });
}

/** F12 用户管理：角色分配 / 禁用启用 */
export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const { id, role, status } = (await req.json()) as { id?: string; role?: string; status?: string };
  if (!id) return Response.json({ error: '缺少用户 id' }, { status: 400 });
  if (id === session.user.id) return Response.json({ error: '不能修改自己的账号' }, { status: 400 });

  const data: { role?: string; status?: string } = {};
  if (role !== undefined) {
    if (role !== 'user' && role !== 'admin') return Response.json({ error: '角色非法' }, { status: 400 });
    data.role = role;
  }
  if (status !== undefined) {
    if (status !== 'active' && status !== 'disabled') return Response.json({ error: '状态非法' }, { status: 400 });
    data.status = status;
  }
  if (!Object.keys(data).length) return Response.json({ error: '未指定修改内容' }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return Response.json({ error: '用户不存在' }, { status: 404 });

  // 保证系统至少保留一名可用管理员
  if ((data.role === 'user' && target.role === 'admin') || data.status === 'disabled') {
    const targetWillBeAdmin = target.role === 'admin' && data.role !== 'user';
    if (targetWillBeAdmin) {
      const otherAdmins = await prisma.user.count({ where: { role: 'admin', id: { not: id }, status: 'active' } });
      if (otherAdmins === 0) return Response.json({ error: '至少保留一名可用管理员' }, { status: 400 });
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
  });
  return Response.json({ ...updated, isSelf: false, createdAt: updated.createdAt.toISOString() });
}
