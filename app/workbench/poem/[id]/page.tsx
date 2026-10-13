import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PoemDetailView } from '@/components/workbench/poem-detail-view';

export const dynamic = 'force-dynamic';

/** F2 诗词详情页：诗文 + 译文/赏析（缓存直出，无缓存 AI 生成） */
export default async function PoemDetailPage({ params }: { params: { id: string } }) {
  const poem = await prisma.poem.findUnique({
    where: { id: params.id },
    include: { annotations: true },
  });
  if (!poem) notFound();

  const bio = await prisma.poetBio.findFirst({ where: { name: poem.author } });
  const bioText = bio?.bioSimp || bio?.bioDesc || null;

  return (
    <div className="mx-auto max-w-[820px]">
      <Link href="/workbench/explore" className="mb-4 inline-flex items-center gap-1.5 font-ui text-sm text-ink-soft transition-ink hover:text-ink-deep">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
        返回诗词探索
      </Link>
      <PoemDetailView
        poem={{
          id: poem.id,
          title: poem.title,
          author: poem.author,
          dynasty: poem.dynasty,
          lines: (poem.paragraphsSimp as string[] | null) || (poem.paragraphs as string[] | null) || [],
          tags: (poem.tags as string[] | null) || [],
        }}
        bio={bioText}
        initial={{
          fanyi: poem.annotations?.fanyi || null,
          shangxi: poem.annotations?.shangxi || null,
          source: poem.annotations?.source || null,
        }}
      />
    </div>
  );
}
