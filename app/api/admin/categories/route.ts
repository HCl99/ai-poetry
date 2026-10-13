import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { POST_CATEGORIES } from '@/lib/community';

export const dynamic = 'force-dynamic';

/** F14 分类管理：朝代分布 + 意象清单 + 社区分类统计 */
export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';

  const [dynasties, imageryTotal, imagery, postCats] = await Promise.all([
    prisma.poem.groupBy({ by: ['dynasty'], _count: { _all: true }, orderBy: { _count: { dynasty: 'desc' } } }),
    prisma.imagery.count(),
    prisma.imagery.findMany({
      where: q ? { char: { contains: q } } : undefined,
      orderBy: { count: 'desc' },
      take: 60,
    }),
    prisma.post.groupBy({ by: ['category'], _count: { _all: true } }),
  ]);
  const catMap = new Map(postCats.map((c) => [c.category, c._count._all]));

  return Response.json({
    dynasties: dynasties.map((d) => ({ dynasty: d.dynasty, count: d._count._all })),
    imagery: {
      total: imageryTotal,
      items: imagery.map((i) => ({ char: i.char, count: i.count })),
    },
    categories: POST_CATEGORIES.map((c) => ({ name: c, count: catMap.get(c) || 0 })),
  });
}

/** F14 分类管理：新增意象字 */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const { char } = (await req.json()) as { char?: string };
  const c = char?.trim();
  if (!c || c.length > 4) return Response.json({ error: '意象字需为 1-4 个字符' }, { status: 400 });

  const exist = await prisma.imagery.findUnique({ where: { char: c }, select: { char: true } });
  if (exist) return Response.json({ error: '该意象已存在' }, { status: 400 });

  await prisma.imagery.create({ data: { char: c, count: 0 } });
  return Response.json({ ok: true });
}

/** F14 分类管理：删除意象字（关联表 poem_imagery 一并清理） */
export async function DELETE(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const char = new URL(req.url).searchParams.get('char');
  if (!char) return Response.json({ error: '缺少 char' }, { status: 400 });

  const exist = await prisma.imagery.findUnique({ where: { char }, select: { char: true } });
  if (!exist) return Response.json({ error: '意象不存在' }, { status: 404 });

  await prisma.poemImagery.deleteMany({ where: { imageryChar: char } });
  await prisma.imagery.delete({ where: { char } });
  return Response.json({ ok: true });
}
