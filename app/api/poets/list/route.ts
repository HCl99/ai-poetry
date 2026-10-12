import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** 诗人对话的候选列表：默认按互提关系度排序的头部诗人，支持按名字搜索 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';

  if (q) {
    const bios = await prisma.poetBio.findMany({
      where: { name: { contains: q } },
      select: { name: true, dynasty: true, bioSimp: true, bioDesc: true },
      take: 24,
    });
    return Response.json(
      bios.map((b) => ({
        name: b.name,
        dynasty: b.dynasty,
        intro: (b.bioSimp || b.bioDesc || '').slice(0, 80),
      })),
    );
  }

  // 头部诗人：互提关系加权度最高者
  const deg = await prisma.poetRelation.groupBy({
    by: ['source'],
    _sum: { weight: true },
    orderBy: { _sum: { weight: 'desc' } },
    take: 24,
  });
  const names = deg.map((d) => d.source);
  const bios = await prisma.poetBio.findMany({
    where: { name: { in: names } },
    select: { name: true, dynasty: true, bioSimp: true, bioDesc: true },
  });
  const bioMap = new Map(bios.map((b) => [b.name, b]));
  const degMap = new Map(deg.map((d) => [d.source, d._sum.weight || 0]));

  return Response.json(
    names
      .map((n) => {
        const b = bioMap.get(n);
        return {
          name: n,
          dynasty: b?.dynasty || '唐',
          intro: ((b?.bioSimp || b?.bioDesc || '') as string).slice(0, 80),
          degree: degMap.get(n) || 0,
        };
      })
      .sort((a, b) => b.degree - a.degree),
  );
}
