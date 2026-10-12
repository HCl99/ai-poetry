'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Star, Link as LinkIcon, BookOpen, Network, Check, Download } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { sseEvents } from '@/lib/sse';
import { parseAnnotationSections } from '@/lib/sections';

interface PoemItem {
  id: string; title: string; author: string; dynasty: string;
  first: string; tags: string[]; hasAnnotation: boolean;
}
type DimKey = 'zici' | 'diangu' | 'qinggan' | 'geli';
interface Dim { key: DimKey; tag: string; content: string; citation: string }
interface RelatedPoem { id: string; title: string; author: string; dynasty: string; score?: number | null }
interface Step { label: string; detail?: string }
interface StreamState {
  model: string;
  dims: Dim[];
  related: RelatedPoem[];
  steps: Step[];
  phase: 'retrieve' | 'generate' | 'done';
  latencyMs?: number;
}

/** 引用归因高亮：正文中《诗题》若命中本次检索结果，渲染为可识别的归因标记 */
function renderWithCitations(text: string, related: RelatedPoem[]): React.ReactNode {
  const titles = new Map(related.map((r) => [r.title, r]));
  const parts = text.split(/(《[^》]{1,30}》)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const m = part.match(/^《([^》]{1,30})》$/);
    const hit = m ? titles.get(m[1]) : undefined;
    if (hit) {
      return (
        <mark
          key={i}
          title={`引用自检索相似诗篇：《${hit.title}》${hit.author}`}
          className="rounded px-0.5 font-medium"
          style={{ background: 'rgba(107,142,123,0.18)', color: '#4E6E5D' }}
        >
          {part}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const DYNASTY_CLASS: Record<string, string> = {
  唐: 'dynasty-tang', 宋: 'dynasty-song', 元: 'dynasty-yuan', 明清: 'dynasty-mingqing',
};

export function AnnotateView() {
  const [poems, setPoems] = useState<PoemItem[]>([]);
  const [selected, setSelected] = useState<PoemItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [error, setError] = useState('');
  const [fav, setFav] = useState(false);
  const fullRef = useRef('');
  const [showSteps, setShowSteps] = useState(false);
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
    setStream(null);
    setShowSteps(false);
    fullRef.current = '';

    // 首个检索 step 可能早于 meta 到达，先建空骨架
    const ensure = (patch: Partial<StreamState>): StreamState => ({
      model: '', dims: [], related: [], steps: [], phase: 'retrieve', ...patch,
    });

    try {
      const r = await fetch('/api/annotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poemId: selected.id }),
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || '生成失败');
      }

      for await (const { event, data } of sseEvents(r)) {
        if (event === 'step') {
          setStream((s) => {
            const base = s ?? ensure({});
            return { ...base, phase: 'retrieve', steps: [...base.steps, { label: data.label, detail: data.detail }] };
          });
        } else if (event === 'meta') {
          setStream((s) => ({
            ...ensure({ ...s }),
            model: data.model,
            dims: (data.dims as Omit<Dim, 'content'>[]).map((d) => ({ ...d, content: '' })),
            related: data.related as RelatedPoem[],
          }));
        } else if (event === 'delta') {
          fullRef.current += data.text || '';
          const sec = parseAnnotationSections(fullRef.current);
          setStream((s) =>
            s
              ? {
                  ...s,
                  phase: 'generate',
                  dims: s.dims.map((d) => ({ ...d, content: sec[d.key] || '' })),
                }
              : s,
          );
        } else if (event === 'error') {
          throw new Error(data.error || '生成失败');
        } else if (event === 'done') {
          setStream((s) =>
            s
              ? { ...s, phase: 'done', latencyMs: data.latencyMs, dims: data.dimensions as Dim[] }
              : s,
          );
          show('AI注解完成');
        }
      }
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

  /** 导出带引用出处的 Markdown 注解报告 */
  function exportMd() {
    if (!selected || !stream || stream.phase !== 'done') return;
    const lines: string[] = [
      `# 《${selected.title}》AI 注解报告`,
      '',
      `> 〔${selected.dynasty}〕${selected.author} · 墨韵诗心 AI 注解引擎 · 模型 ${stream.model} · 耗时 ${((stream.latencyMs ?? 0) / 1000).toFixed(1)}s`,
      '',
      '## 原文',
      '',
      selected.first || '（无正文）',
      '',
    ];
    for (const d of stream.dims) {
      lines.push(`## ${d.tag}`, '', d.content || '（无内容）', '', `> 引用出处：${d.citation}`, '');
    }
    if (stream.related.length) {
      lines.push('## RAG 检索相似诗篇', '');
      for (const r of stream.related) {
        lines.push(
          `- 《${r.title}》 ${r.author}〔${r.dynasty}〕${r.score != null ? `（相似度 ${(r.score * 100).toFixed(0)}%）` : ''}`,
        );
      }
      lines.push('');
    }
    lines.push('---', `生成时间：${new Date().toLocaleString('zh-CN')}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `注解-${selected.title}-${selected.author}.md`;
    a.click();
    URL.revokeObjectURL(url);
    show('已导出 Markdown 注解报告');
  }

  const isDone = stream?.phase === 'done';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">AI智能注解</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          RAG · 向量语义检索 · 引用追溯，先以 BGE 向量检索相似诗篇与诗人小传，再四维度生成注解
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
                setStream(null);
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

          {/* 检索与引用追溯说明 */}
          <div className="paper-card p-5">
            <div className="flex items-center gap-2">
              <span className="pulse-dot" />
              <span className="font-ui text-xs font-medium" style={{ color: '#6B8E7B' }}>检索与引用追溯</span>
            </div>
            <p className="mt-2 font-ui text-xs leading-relaxed text-ink-soft">
              每条注解先以 BGE 中文向量模型将诗词编码为 512 维语义向量，在向量库中检索最相似的诗篇，
              连同诗人小传一起作为上下文交由大模型生成，卡片底部标注真实引用出处与相似度，AI 言之有据。
            </p>
          </div>
        </div>

        {/* 右栏：注解结果 */}
        <div className="lg:col-span-3">
          <div className="paper-card flex min-h-[560px] flex-col p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-ui text-[15px] font-medium text-ink-deep">注解结果</h2>
              {stream && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-ui text-xs" style={{ background: 'rgba(107,142,123,0.15)', color: '#6B8E7B' }}>
                  <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse' : ''}`} style={{ background: '#6B8E7B' }} />
                  {stream.phase === 'retrieve' ? '向量检索中' : stream.phase === 'generate' ? 'AI 撰写中' : '引用可追溯'}
                </span>
              )}
            </div>

            {/* 空状态 */}
            {!stream && !loading && !error && (
              <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                <BookOpen className="h-12 w-12 text-ink-soft/40" strokeWidth={1.5} />
                <p className="mt-4 font-ui text-sm text-ink-soft">选择一首诗词，点击「生成AI注解」</p>
                <p className="mt-1 font-ui text-xs text-ink-soft/70">AI 将输出字词释义 · 典故溯源 · 情感分析 · 格律分析</p>
              </div>
            )}

            {/* 初始加载（首个 step 到达前） */}
            {loading && !stream && (
              <div className="flex flex-1 flex-col items-center justify-center py-16">
                <span className="spinner spinner-ink" style={{ width: 24, height: 24 }} />
                <p className="mt-4 font-ui text-sm text-ink-soft">正在连接 AI 服务…</p>
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

            {stream && (
              <div className="flex-1 space-y-4">
                {/* 完成后可回看检索与思考过程 */}
                {isDone && stream.steps.length > 0 && (
                  <button
                    onClick={() => setShowSteps((v) => !v)}
                    className="font-ui text-xs text-muted-blue transition-ink hover:underline"
                  >
                    {showSteps ? '收起检索过程 ▲' : `查看 AI 检索与思考过程（${stream.steps.length} 步）▼`}
                  </button>
                )}

                {/* 思考过程：生成中实时展示，完成后可折叠回看 */}
                {stream.steps.length > 0 && (loading || showSteps) && (
                  <div className="rounded-lg p-4" style={{ background: 'rgba(123,142,161,0.06)', border: '1px dashed #C9CFD6' }}>
                    <div className="mb-2.5 font-ui text-xs font-medium text-muted-blue">AI 检索与思考过程</div>
                    <ul className="space-y-2">
                      {stream.steps.map((st, i) => (
                        <li key={i} className="flex items-start gap-2 font-ui text-xs">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#6B8E7B' }} />
                          <span className="text-ink-mid">{st.label}</span>
                          {st.detail && <span className="text-ink-soft/80">· {st.detail}</span>}
                        </li>
                      ))}
                      {loading && (
                        <li className="flex items-center gap-2 font-ui text-xs text-ink-soft">
                          <span className="h-3.5 w-3.5 shrink-0" />
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#7B8EA1' }} />
                            {stream.phase === 'retrieve' ? '正在检索知识库…' : '大模型正在撰写四维度注解…'}
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* 四维度卡片（meta 到达后渲染，逐字流式） */}
                {stream.dims.map((d) => {
                  const active = loading && stream.phase === 'generate';
                  return (
                    <div
                      key={d.key}
                      className="rounded-lg p-4 anim-fade-up"
                      style={{ borderLeft: '3px solid #8B7355', background: '#F5F2EC' }}
                    >
                      <div className="mb-1.5 flex items-center gap-1.5 font-ui text-xs font-medium text-ink-deep">
                        <Sparkles className="h-3.5 w-3.5 text-sepia" /> {d.tag}
                      </div>
                      {d.content ? (
                        <p className="font-ui text-[15px] leading-relaxed text-ink-mid">
                          {renderWithCitations(d.content, stream.related)}
                          {active && <span className="ml-0.5 inline-block animate-pulse text-sepia">▍</span>}
                        </p>
                      ) : (
                        <p className="font-ui text-[15px] leading-relaxed text-ink-soft/50">
                          {loading ? '等待撰写…' : '（无内容）'}
                        </p>
                      )}
                      <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-ui text-xs" style={{ border: '1px dashed #7B8EA1', color: '#7B8EA1', background: 'rgba(123,142,161,0.06)' }}>
                        <LinkIcon className="h-3 w-3" /> {d.citation}
                      </div>
                    </div>
                  );
                })}

                {/* 向量语义检索到的相似诗篇（meta 到达即可见，体现先检索后生成） */}
                {stream.related.length > 0 && (
                  <div className="rounded-lg p-4" style={{ border: '1px dashed #D4CFC5', background: 'rgba(123,142,161,0.05)' }}>
                    <div className="mb-2 flex items-center gap-1.5 font-ui text-xs font-medium text-muted-blue">
                      <Network className="h-3.5 w-3.5" /> RAG · 向量语义检索到的相似诗篇
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {stream.related.map((r) => (
                        <span key={r.id} className="rounded-full bg-white/70 px-3 py-1 font-ui text-xs text-ink-mid">
                          《{r.title}》 {r.author}
                          {r.score != null && <span className="ml-1 text-sepia">{(r.score * 100).toFixed(0)}%</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {isDone && (
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={exportMd}
                      className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                    >
                      <Download className="h-3.5 w-3.5" /> 导出 Markdown 报告
                    </button>
                    <p className="font-ui text-xs text-ink-soft/70">
                      {stream.model} · 耗时 {((stream.latencyMs ?? 0) / 1000).toFixed(1)}s
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
