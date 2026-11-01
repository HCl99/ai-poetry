import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type VisionResult = {
  analysis?: { imagery?: string[]; mood?: string; scene?: string; keywords?: string[]; lookupChars?: string[] };
  poemIds?: string[];
};

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function CreationsPage() {
  const session = await auth();
  const userId = session?.user?.id || '';
  const items = userId
    ? await prisma.aiCreation.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 60 })
    : [];

  const images = items.filter((c) => c.kind === 'inkpaint');
  const visions = items.filter((c) => c.kind === 'vision');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">我的创作</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          共 {items.length} 条记录 · 文生图 {images.length} 张 · 以图搜诗 {visions.length} 次（仅展示最近 60 条）
        </p>
      </div>

      {items.length === 0 ? (
        <div className="paper-card p-10 text-center">
          <p className="font-ui text-sm text-ink-soft">还没有创作记录。</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link href="/workbench/vision" className="rounded-lg border-[1.5px] border-c px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark">
              去以图搜诗
            </Link>
            <Link href="/workbench/annotate" className="rounded-lg border-[1.5px] border-c px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark">
              去 AI 智能注解
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => {
            const vr = (c.result || {}) as VisionResult;
            const a = vr.analysis;
            return (
              <div key={c.id} className="paper-card overflow-hidden">
                {c.kind === 'inkpaint' && c.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={c.imageUrl} alt={c.prompt} className="h-48 w-full object-cover" />
                ) : (
                  <div className="flex h-48 flex-col justify-center gap-2 bg-paper-dark px-4">
                    {(a?.imagery || []).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(a?.imagery || []).slice(0, 6).map((t) => (
                          <span key={t} className="rounded border border-c bg-paper px-2 py-0.5 font-serif text-sm text-ink-black">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="font-ui text-xs text-ink-soft">未识别出意象</span>
                    )}
                  </div>
                )}
                <div className="space-y-1.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded border border-c px-1.5 py-0.5 font-ui text-[11px] text-ink-soft">
                      {c.kind === 'inkpaint' ? '文生图' : '以图搜诗'}
                    </span>
                    <span className="font-ui text-[11px] text-ink-soft">{fmt(c.createdAt)}</span>
                  </div>
                  <p className="line-clamp-2 font-serif text-sm text-ink-black">{c.prompt}</p>
                  {c.kind === 'vision' && (
                    <p className="font-ui text-xs text-ink-soft">
                      {a?.scene ? `${a.scene} · ` : ''}
                      {a?.mood ? `情绪：${a.mood} · ` : ''}
                      命中 {vr.poemIds?.length || 0} 首诗
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
