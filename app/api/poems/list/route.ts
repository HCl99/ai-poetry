import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

async function GET_impl(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';
  const id = searchParams.get('id')?.trim() || '';
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '30', 10));

  const where = id
    ? { id }
    : q
      ? { OR: [{ title: { contains: q } }, { author: { contains: q } }] }
      : { NOT: { tags: { equals: '[]' } } }; // 优先有标签的唐诗三百首

  const poems = await prisma.poem.findMany({
    where,
    select: {
      id: true, title: true, author: true, dynasty: true,
      paragraphsSimp: true, tags: true, annotations: { select: { poemId: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const data = poems.map((p) => ({
    id: p.id,
    title: p.title,
    author: p.author,
    dynasty: p.dynasty,
    first: ((p.paragraphsSimp as string[] | null) || []).join(''),
    tags: (p.tags as string[] | null) || [],
    hasAnnotation: !!p.annotations,
  }));

  // 按 id 查单篇返回对象本身（不存在时返回 null），调用方可直接当作诗篇使用；
  // 否则返回数组。前端若拿到数组当对象用，会出现 tags 为 undefined 的渲染崩溃。
  return Response.json(id ? data[0] ?? null : data);
}

export const GET = withApi(GET_impl);
