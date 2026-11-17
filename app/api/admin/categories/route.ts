import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { getPostCategories } from '@/lib/postCategories';
import { withApi, ApiError } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

/** F14 分类管理：朝代分布 + 意象清单 + 社区分类统计 */
async function GET_impl(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';

  const [dynasties, imageryTotal, imagery, postCats, categories] = await Promise.all([
    prisma.poem.groupBy({ by: ['dynasty'], _count: { _all: true }, orderBy: { _count: { dynasty: 'desc' } } }),
    prisma.imagery.count(),
    prisma.imagery.findMany({
      where: q ? { char: { contains: q } } : undefined,
      orderBy: { count: 'desc' },
      take: 60,
    }),
    prisma.post.groupBy({ by: ['category'], _count: { _all: true } }),
    getPostCategories(),
  ]);
  const catMap = new Map(postCats.map((c) => [c.category, c._count._all]));

  return Response.json({
    dynasties: dynasties.map((d) => ({ dynasty: d.dynasty, count: d._count._all })),
    imagery: {
      total: imageryTotal,
      items: imagery.map((i) => ({ char: i.char, count: i.count })),
    },
    categories: categories.map((c) => ({ id: c.id, name: c.name, desc: c.desc, count: catMap.get(c.name) || 0 })),
  });
}

/** F14 分类管理：新增意象字 */
async function POST_impl(req: Request) {
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
async function DELETE_impl(req: Request) {
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

/** F14 分类管理：按 poem_imagery 实际关联重算意象计数，让新增/删除诗词后的数字保持真实 */
async function PUT_impl(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const { action } = (await req.json()) as { action?: string };
  if (action !== 'recalc') throw new ApiError(400, '未知操作');

  // 单条相关子查询批量更新：意象字常有数千个，逐条 update 会撑爆事务与连接
  // 语句为静态常量、不含任何用户输入，故使用 $executeRawUnsafe
  const affected = await prisma.$executeRawUnsafe(
    'UPDATE `imagery` `i` SET `count` = (SELECT COUNT(*) FROM `poem_imagery` `pi` WHERE `pi`.`imagery_char` = `i`.`char`)',
  );
  const linked = await prisma.poemImagery.groupBy({ by: ['imageryChar'], _count: { _all: true } });
  return Response.json({ ok: true, updated: affected, linked: linked.length });
}

export const GET = withApi(GET_impl);
export const POST = withApi(POST_impl);
export const PUT = withApi(PUT_impl);
export const DELETE = withApi(DELETE_impl);
