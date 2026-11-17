import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

function normalizeLines(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function normalizeTags(v: unknown): string[] | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const arr = Array.isArray(v) ? v : String(v).split(/[,，、\s]+/);
  const tags = arr.map((x) => String(x).trim()).filter(Boolean);
  return tags.length ? tags : undefined;
}

/** F13 诗词管理：列表搜索 + 分页 */
async function GET_impl(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const dynasty = url.searchParams.get('dynasty')?.trim() || '';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const size = Math.min(50, Math.max(5, Number(url.searchParams.get('size')) || 10));

  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ title: { contains: q } }, { author: { contains: q } }];
  if (dynasty) where.dynasty = dynasty;

  const [total, rows] = await Promise.all([
    prisma.poem.count({ where }),
    prisma.poem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
      include: { annotations: { select: { poemId: true } } },
    }),
  ]);

  return Response.json({
    items: rows.map((p) => ({
      id: p.id, title: p.title, author: p.author, dynasty: p.dynasty,
      paragraphs: p.paragraphs, tags: p.tags,
      hasAnnotation: !!p.annotations,
      createdAt: p.createdAt.toISOString(),
    })),
    total, page, size,
  });
}

/** F13 诗词管理：新增 */
async function POST_impl(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const body = (await req.json()) as { title?: string; author?: string; dynasty?: string; paragraphs?: unknown; tags?: unknown };
  const title = body.title?.trim();
  const author = body.author?.trim();
  const dynasty = body.dynasty?.trim() || '唐';
  const paragraphs = normalizeLines(body.paragraphs);
  if (!title || !author) return Response.json({ error: '诗题与作者不能为空' }, { status: 400 });
  if (!paragraphs.length) return Response.json({ error: '诗文内容不能为空' }, { status: 400 });

  const poem = await prisma.poem.create({
    data: {
      id: crypto.randomUUID(),
      title, author, dynasty,
      paragraphs,
      tags: normalizeTags(body.tags),
      sourceFile: '管理员新增',
    },
  });
  return Response.json({ id: poem.id });
}

/** F13 诗词管理：编辑 */
async function PUT_impl(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const body = (await req.json()) as { id?: string; title?: string; author?: string; dynasty?: string; paragraphs?: unknown; tags?: unknown };
  if (!body.id) return Response.json({ error: '缺少 id' }, { status: 400 });
  const exist = await prisma.poem.findUnique({ where: { id: body.id }, select: { id: true } });
  if (!exist) return Response.json({ error: '诗词不存在' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const t = body.title.trim();
    if (!t) return Response.json({ error: '诗题不能为空' }, { status: 400 });
    data.title = t;
  }
  if (body.author !== undefined) {
    const a = body.author.trim();
    if (!a) return Response.json({ error: '作者不能为空' }, { status: 400 });
    data.author = a;
  }
  if (body.dynasty !== undefined) data.dynasty = body.dynasty.trim() || '唐';
  if (body.paragraphs !== undefined) {
    const lines = normalizeLines(body.paragraphs);
    if (!lines.length) return Response.json({ error: '诗文内容不能为空' }, { status: 400 });
    data.paragraphs = lines;
  }
  if (body.tags !== undefined) data.tags = normalizeTags(body.tags) ?? [];

  await prisma.poem.update({ where: { id: body.id }, data });
  return Response.json({ ok: true });
}

/** F13 诗词管理：删除（注解/意象关联/向量切片随外联级联删除） */
async function DELETE_impl(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: '缺少 id' }, { status: 400 });
  const exist = await prisma.poem.findUnique({ where: { id }, select: { id: true } });
  if (!exist) return Response.json({ error: '诗词不存在' }, { status: 404 });

  await prisma.poem.delete({ where: { id } });
  return Response.json({ ok: true });
}

export const GET = withApi(GET_impl);
export const POST = withApi(POST_impl);
export const PUT = withApi(PUT_impl);
export const DELETE = withApi(DELETE_impl);
