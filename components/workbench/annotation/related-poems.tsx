import { Network } from 'lucide-react';

interface RelatedPoem { id: string; title: string; author: string; dynasty: string; score?: number | null }

/** RAG 向量语义检索到的相似诗篇标签云 */
export function RelatedPoems({ related }: { related: RelatedPoem[] }) {
  if (related.length === 0) return null;
  return (
    <div className="rounded-lg p-4" style={{ border: '1px dashed var(--border-c)', background: 'rgba(123,142,161,0.05)' }}>
      <div className="mb-2 flex items-center gap-1.5 font-ui text-xs font-medium text-muted-blue">
        <Network className="h-3.5 w-3.5" /> RAG · 向量语义检索到的相似诗篇
      </div>
      <div className="flex flex-wrap gap-2">
        {related.map((r) => (
          <span key={r.id} className="rounded-full bg-white/70 px-3 py-1 font-ui text-xs text-ink-mid">
            《{r.title}》 {r.author}
            {r.score != null && <span className="ml-1 text-sepia">{(r.score * 100).toFixed(0)}%</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
