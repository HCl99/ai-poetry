import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
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

  return Response.json(
    poems.map((p) => ({
      id: p.id,
      title: p.title,
      author: p.author,
      dynasty: p.dynasty,
      first: ((p.paragraphsSimp as string[] | null) || []).join(''),
      tags: (p.tags as string[] | null) || [],
      hasAnnotation: !!p.annotations,
    })),
  );
}
