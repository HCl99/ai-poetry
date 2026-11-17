import { prisma } from '@/lib/prisma';
import { ImageryView } from '@/components/workbench/imagery-view';

export const dynamic = 'force-dynamic';

export default async function ImageryPage({
  searchParams,
}: {
  searchParams: { focus?: string };
}) {
  const [imagery, edges] = await Promise.all([
    prisma.imagery.findMany({ orderBy: { count: 'desc' } }),
    // 全量共现边（当前库内 1,225 条），截断会导致冷门意象误显示为「暂无共现数据」
    prisma.imageryCooccurrence.findMany({ orderBy: { weight: 'desc' } }),
  ]);

  return (
    <ImageryView
      imagery={imagery.map((i) => ({ char: i.char, count: i.count }))}
      edges={edges.map((e) => ({ source: e.sourceChar, target: e.targetChar, weight: e.weight }))}
      initialFocus={searchParams.focus || imagery[0]?.char || '月'}
    />
  );
}
