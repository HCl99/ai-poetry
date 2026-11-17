import { prisma } from '@/lib/prisma';
import { PoetGraphView } from '@/components/workbench/poet-graph-view';

export const dynamic = 'force-dynamic';

export default async function PoetGraphPage({
  searchParams,
}: {
  searchParams: { focus?: string };
}) {
  const [relations, bios] = await Promise.all([
    prisma.poetRelation.findMany({ orderBy: { weight: 'desc' } }),
    prisma.poetBio.findMany({ select: { name: true, dynasty: true } }),
  ]);

  const dynastyMap = Object.fromEntries(bios.map((b) => [b.name, b.dynasty]));
  // 每个诗人的度数（关系总数），用于节点大小与快捷入口
  const degreeMap: Record<string, number> = {};
  for (const r of relations) {
    degreeMap[r.source] = (degreeMap[r.source] || 0) + 1;
    degreeMap[r.target] = (degreeMap[r.target] || 0) + 1;
  }

  const topFocus =
    Object.entries(degreeMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '李白';
  // 支持 ?focus= 深链：只接受小传名单里的名字，否则回落到关联最广的诗人
  const focusParam = searchParams.focus?.trim();
  const initialFocus = focusParam && dynastyMap[focusParam] ? focusParam : topFocus;

  // 关系涉及的诗人在库内的诗篇数：入口榜单优先展示有作品的诗人，避免仅见于小传的冷门人物霸榜
  const relationPoets = [...new Set(relations.flatMap((r) => [r.source, r.target]))];
  const poemGroups = relationPoets.length
    ? await prisma.poem.groupBy({
        by: ['author'],
        where: { author: { in: relationPoets } },
        _count: true,
      })
    : [];
  const poemCountMap: Record<string, number> = Object.fromEntries(
    poemGroups.map((g) => [g.author, Number(g._count)])
  );

  return (
    <PoetGraphView
      relations={relations.map((r) => ({ source: r.source, target: r.target, weight: r.weight }))}
      dynastyMap={dynastyMap}
      degreeMap={degreeMap}
      poemCountMap={poemCountMap}
      initialFocus={initialFocus}
      poetCount={bios.length}
    />
  );
}
