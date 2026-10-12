import { prisma } from '@/lib/prisma';
import { PoetGraphView } from '@/components/workbench/poet-graph-view';

export const dynamic = 'force-dynamic';

export default async function PoetGraphPage() {
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

  const initialFocus =
    Object.entries(degreeMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '李白';

  return (
    <PoetGraphView
      relations={relations.map((r) => ({ source: r.source, target: r.target, weight: r.weight }))}
      dynastyMap={dynastyMap}
      degreeMap={degreeMap}
      initialFocus={initialFocus}
    />
  );
}
