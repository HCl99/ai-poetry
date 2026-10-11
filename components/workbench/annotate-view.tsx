'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Star, Link as LinkIcon, BookOpen, Network } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';

interface PoemItem {
  id: string; title: string; author: string; dynasty: string;
  first: string; tags: string[]; hasAnnotation: boolean;
}
interface Dimension { key: string; tag: string; content: string; citation: string }
interface RelatedPoem { id: string; title: string; author: string; dynasty: string }
interface AnnotationResult {
  dimensions: Dimension[];
  related: RelatedPoem[];
  hasBio: boolean;
  latencyMs: number;
  model: string;
}

const DYNASTY_CLASS: Record<string, string> = {
  唐: 'dynasty-tang', 宋: 'dynasty-song', 元: 'dynasty-yuan', 明清: 'dynasty-mingqing',
};

export function AnnotateView() {
  const [poems, setPoems] = useState<PoemItem[]>([]);
  const [selected, setSelected] = useState<PoemItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnnotationResult | null>(null);
  const [error, setError] = useState('');
  const [fav, setFav] = useState(false);
  const { msg, show } = useToast();

  useEffect(() => {
    fetch('/api/poems/list?limit=50')
      .then((r) => r.json())
      .then((list: PoemItem[]) => {
        setPoems(list);
        if (list.length) setSelected(list[0]);
      })
      .catch(() => setError('诗词列表加载失败'));
  }, []);

  async function generate() {
    if (!selected || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/annotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poemId: selected.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || '生成失败');
      setResult(data);
    } catch (e: any) {
      setError(e.message || '网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function toggleFav() {
    if (!selected) return;
    const r = await fetch('/api/user/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poemId: selected.id }),
    });
    if (r.ok) {
      const d = await r.json();
      setFav(!!d.favorited);
      show(d.favorited ? '已加入收藏' : '已取消收藏');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">AI智能注解</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          RAG向量检索 · 引用追溯全链路，四维度解析诗词
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* 左栏：诗词选择 */}
        <div className="space-y-5 lg:col-span-2">
          <div className="paper-card p-6">
            <h2 className="mb-3 font-ui text-[15px] font-medium text-ink-deep">选择诗词</h2>
            <select
              value={selected?.id || ''}
              onChange={(e) => {
                setSelected(poems.find((p) => p.id === e.target.value) || null);
                setResult(null);
                setFav(false);
              }}
              className="h-11 w-full rounded-lg border-[1.5px] border-c bg-white/70 px-3 font-ui text-sm outline-none transition-ink focus:border-ink-deep"
            >
              {poems.map((p) => (
                <option key={p.id} value={p.id}>
                  《{p.title}》 {p.author}{p.hasAnnotation ? ' · 已有赏析' : ''}
                </option>
              ))}
            </select>

            {selected && (
              <>
                <div className="mt-5 rounded-lg p-6" style={{ background: '#F5F2EC' }}>
                  <div className="text-center">
                    <span className={`dynasty-tag ${DYNASTY_CLASS[selected.dynasty] || 'dynasty-tang'}`}>{selected.dynasty}</span>
                    <h3 className="mt-2 font-brush text-2xl text-ink-deep">{selected.title}</h3>
                    <p className="mt-1 font-ui text-xs text-ink-soft">{selected.author}</p>
                  </div>
                  <div className="my-4 ink-divider" />
                  <div className="text-center font-serif text-base leading-[2.5] text-ink-mid">
                    {selected.first ? selected.first.split(/(?<=[，。？！；])/).filter(Boolean).map((l, i) => <p key={i}>{l}</p>) : <p>（无正文）</p>}
                  </div>
                </div>
                {selected.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.tags.slice(0, 4).map((t) => (
                      <span key={t} className="rounded-full bg-paper-dark px-2.5 py-0.5 font-ui text-xs text-ink-soft">{t}</span>
                    ))}
                  </div>
                )}
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={generate}
                    disabled={loading}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:opacity-60"
                    style={{ background: '#3A3835' }}
                  >
                    {loading ? <span className="spinner" style={{ width: 15, height: 15 }} /> : <Sparkles className="h-4 w-4" />}
                    {loading ? '生成中…' : '生成AI注解'}
                  </button>
                  <button
                    onClick={toggleFav}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border-[1.5px] border-c transition-ink hover:bg-paper-dark"
                    style={fav ? { borderColor: '#A67C7C', color: '#A67C7C' } : { color: '#8B857E' }}
                    aria-label="收藏"
                  >
                    <Star className="h-4 w-4" fill={fav ? '#A67C7C' : 'none'} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* RAG 引用追溯说明 */}
          <div className="paper-card p-5">
            <div className="flex items-center gap-2">
              <span className="pulse-dot" />
              <span className="font-ui text-xs font-medium" style={{ color: '#6B8E7B' }}>RAG引用追溯</span>
            </div>
            <p className="mt-2 font-ui text-xs leading-relaxed text-ink-soft">
              每条注解由向量检索诗词库、意象共现库、诗人小传后生成，
              底部标注真实引用出处，AI言之有据。
            </p>
          </div>
        </div>

        {/* 右栏：注解结果 */}
        <div className="lg:col-span-3">
          <div className="paper-card flex min-h-[560px] flex-col p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-ui text-[15px] font-medium text-ink-deep">注解结果</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-ui text-xs" style={{ background: 'rgba(107,142,123,0.15)', color: '#6B8E7B' }}>
                <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse' : ''}`} style={{ background: '#6B8E7B' }} />
                RAG引用追溯
              </span>
            </div>

            {/* 空状态 */}
            {!result && !loading && !error && (
              <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                <BookOpen className="h-12 w-12 text-ink-soft/40" strokeWidth={1.5} />
                <p className="mt-4 font-ui text-sm text-ink-soft">选择一首诗词，点击「生成AI注解」</p>
                <p className="mt-1 font-ui text-xs text-ink-soft/70">AI将输出字词释义 · 典故溯源 · 情感分析 · 格律分析</p>
              </div>
            )}

            {/* 加载中 */}
            {loading && (
              <div className="flex flex-1 flex-col items-center justify-center py-16">
                <span className="spinner spinner-ink" style={{ width: 24, height: 24 }} />
                <p className="mt-4 font-ui text-sm text-ink-soft">AI正在检索文献库…</p>
                <p className="mt-1 font-ui text-xs text-ink-soft/70">RAG向量检索 → 诗人小传 → 意象共现 → 大模型生成</p>
              </div>
            )}

            {/* 错误 */}
            {error && (
              <div className="flex flex-1 flex-col items-center justify-center py-16">
                <p className="font-ui text-sm" style={{ color: '#A67C7C' }}>{error}</p>
                <button onClick={generate} className="mt-4 rounded-lg px-5 py-2 font-ui text-sm text-white transition-ink" style={{ background: '#3A3835' }}>
                  重试
                </button>
              </div>
            )}

            {/* 结果 */}
            {result && (
              <div className="flex-1 space-y-4 anim-fade-in">
                {result.dimensions.map((d, i) => (
                  <div key={d.key} className="rounded-lg p-4 anim-fade-up" style={{ borderLeft: '3px solid #8B7355', background: '#F5F2EC', animationDelay: `${i * 0.12}s` }}>
                    <div className="mb-1.5 flex items-center gap-1.5 font-ui text-xs font-medium text-ink-deep">
                      <Sparkles className="h-3.5 w-3.5 text-sepia" /> {d.tag}
                    </div>
                    <p className="font-ui text-[15px] leading-relaxed text-ink-mid">{d.content}</p>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-ui text-xs" style={{ border: '1px dashed #7B8EA1', color: '#7B8EA1', background: 'rgba(123,142,161,0.06)' }}>
                      <LinkIcon className="h-3 w-3" /> {d.citation}
                    </div>
                  </div>
                ))}

                {result.related.length > 0 && (
                  <div className="rounded-lg p-4" style={{ border: '1px dashed #D4CFC5', background: 'rgba(123,142,161,0.05)' }}>
                    <div className="mb-2 flex items-center gap-1.5 font-ui text-xs font-medium text-muted-blue">
                      <Network className="h-3.5 w-3.5" /> RAG检索到的同意象诗篇
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {result.related.map((r) => (
                        <span key={r.id} className="rounded-full bg-white/70 px-3 py-1 font-ui text-xs text-ink-mid">
                          《{r.title}》 {r.author}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="pt-1 text-right font-ui text-xs text-ink-soft/70">
                  {result.model} · 耗时 {(result.latencyMs / 1000).toFixed(1)}s
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
