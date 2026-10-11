import { prisma } from '@/lib/prisma';
import { ExploreGrid } from '@/components/workbench/explore-grid';

export const dynamic = 'force-dynamic';

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: { q?: string; dynasty?: string; page?: string };
}) {
  const q = searchParams.q?.trim() || '';
  const dynasty = searchParams.dynasty || '全部';
  const page = Math.max(1, parseInt(searchParams.page || '1', 10));
  const pageSize = 24;

  const where: any = {};
  if (q) where.OR = [{ title: { contains: q } }, { author: { contains: q } }];
  if (dynasty !== '全部') where.dynasty = dynasty;

  const [total, dynastyGroups, poems] = await Promise.all([
    prisma.poem.count({ where }),
    prisma.poem.groupBy({ by: ['dynasty'], _count: { _all: true } }),
    prisma.poem.findMany({
      where,
      select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true, tags: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (p: number) =>
    `/workbench/explore?q=${encodeURIComponent(q)}&dynasty=${encodeURIComponent(dynasty)}&page=${p}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">诗词探索</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          共 {total.toLocaleString()} 首诗词，按朝代、题材、意象浏览检索
        </p>
      </div>

      <ExploreGrid
        poems={poems.map((p) => ({
          id: p.id,
          title: p.title,
          author: p.author,
          dynasty: p.dynasty,
          lines: ((p.paragraphsSimp as string[] | null) || []).slice(0, 4),
          tags: ((p.tags as string[] | null) || []).slice(0, 3),
        }))}
        initialDynasty={dynasty}
        q={q}
        dynastyCounts={Object.fromEntries(
          dynastyGroups.map((g) => [g.dynasty, g._count._all]),
        )}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 font-ui">
          {page > 1 && (
            <a href={qs(page - 1)} className="rounded-lg border-[1.5px] border-c px-4 py-2 text-sm text-ink-mid transition-ink hover:bg-paper-dark">
              上一页
            </a>
          )}
          <span className="text-sm text-ink-soft">{page} / {Math.min(totalPages, 9999)}</span>
          {page < totalPages && (
            <a href={qs(page + 1)} className="rounded-lg border-[1.5px] border-c px-4 py-2 text-sm text-ink-mid transition-ink hover:bg-paper-dark">
              下一页
            </a>
          )}
        </div>
      )}
    </div>
  );
}
