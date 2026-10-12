'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Star, Link as LinkIcon, BookOpen, Network, Check, Download, Volume2, Square, Share2, Mic, MessagesSquare, Palette } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { sseEvents } from '@/lib/sse';
import { parseAnnotationSections } from '@/lib/sections';
import { ShareCard, downloadSharePng } from './share-card';

interface PoemItem {
  id: string; title: string; author: string; dynasty: string;
  first: string; tags: string[]; hasAnnotation: boolean;
}
type DimKey = 'zici' | 'diangu' | 'qinggan' | 'geli';
interface Dim { key: DimKey; tag: string; content: string; citation: string }
interface RelatedPoem { id: string; title: string; author: string; dynasty: string; score?: number | null }
interface Step { label: string; detail?: string }
interface Followup { q: string; a: string; related: RelatedPoem[]; done: boolean }
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
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [vertical, setVertical] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { msg, show } = useToast();
  const abortRef = useRef<AbortController | null>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  // 语音念诗搜索：Web Speech Recognition，念诗题/作者即可定位诗篇
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  // 多轮追问：每次追问独立检索知识库，引用硬约束与主注解一致
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [fuInput, setFuInput] = useState('');
  const [fuLoading, setFuLoading] = useState(false);
  const fuAbortRef = useRef<AbortController | null>(null);
  // 多模态联动：注解完成后按诗中意象标签生成水墨意境图，随分享卡一并导出
  const [inkUrl, setInkUrl] = useState<string | null>(null);
  const [inkLoading, setInkLoading] = useState(false);
  const [inkError, setInkError] = useState('');

  // 换诗时清空上一首的意境配图
  useEffect(() => {
    setInkUrl(null);
    setInkError('');
    setInkLoading(false);
  }, [selected?.id]);

  /** 按意象标签与诗句首联组 prompt，调用 CogView 生成水墨意境图 */
  async function genInk() {
    if (!selected || inkLoading) return;
    setInkLoading(true);
    setInkError('');
    try {
      const prompt = `中国水墨画，《${selected.title}》意境，${selected.tags.slice(0, 3).join('、')}意象，留白意境`;
      const r = await fetch('/api/inkpaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '生成失败');
      setInkUrl(d.url);
      show('意境图已生成，导出分享图将自动收录该配图');
    } catch (e: any) {
      setInkError(e?.message || '意境图生成失败，请重试');
    } finally {
      setInkLoading(false);
    }
  }

  /** 中断当前流式生成，已流式内容保留 */
  function stopGenerate() {
    abortRef.current?.abort();
  }

  // 卸载时中断未完成的请求
  useEffect(() => () => { abortRef.current?.abort(); fuAbortRef.current?.abort(); }, []);

  // 快捷键：Enter 生成注解，Esc 停止生成/追问
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { abortRef.current?.abort(); fuAbortRef.current?.abort(); return; }
      if (e.key !== 'Enter' || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t && ['TEXTAREA', 'INPUT', 'SELECT', 'BUTTON'].includes(t.tagName)) return;
      if (!loading && selected) generate();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, selected]);

  /** Web Speech API 朗读某一维度内容，再次点击停止 */
  function speak(key: string, text: string) {
    if (!('speechSynthesis' in window)) { show('当前浏览器不支持语音合成'); return; }
    if (speakingKey === key) { window.speechSynthesis.cancel(); setSpeakingKey(null); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.9;
    u.onend = () => setSpeakingKey(null);
    u.onerror = () => setSpeakingKey(null);
    setSpeakingKey(key);
    window.speechSynthesis.speak(u);
  }

  useEffect(() => {
    fetch('/api/poems/list?limit=50')
      .then((r) => r.json())
      .then(async (list: PoemItem[]) => {
        let final = list;
        // 支持学习路径「开始学习」跳转：/workbench/annotate?poem=<id> 直接定位
        const pid = new URLSearchParams(window.location.search).get('poem');
        if (pid && !final.some((p) => p.id === pid)) {
          const r2 = await fetch(`/api/poems/list?id=${encodeURIComponent(pid)}`);
          if (r2.ok) {
            const byId: PoemItem | null = await r2.json();
            if (byId) final = [byId, ...final];
          }
        }
        setPoems(final);
        const target = pid ? final.find((p) => p.id === pid) : null;
        setSelected(target || final[0] || null);
      })
      .catch(() => setError('诗词列表加载失败'));
    // 卸载时终止语音识别
    return () => recogRef.current?.abort?.();
  }, []);

  /** 语音念诗：识别 → 检索 → 定位诗篇（与朗读输出构成语音闭环） */
  function startVoiceSearch() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { show('当前浏览器不支持语音识别，请使用 Chrome / Edge'); return; }
    if (listening) { recogRef.current?.stop(); setListening(false); return; }
    const recog = new SR();
    recogRef.current = recog;
    recog.lang = 'zh-CN';
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (e: any) => {
      const text = (e.results?.[0]?.[0]?.transcript as string || '').trim();
      setListening(false);
      if (text) voiceSearch(text);
    };
    recog.onerror = (e: any) => {
      setListening(false);
      if (e?.error === 'not-allowed') show('麦克风权限被拒绝，请在浏览器中允许');
      else if (e?.error === 'no-speech') show('未听到声音，请再念一次');
      else show('语音识别失败，请重试');
    };
    recog.onend = () => setListening(false);
    setListening(true);
    show('请念诗题或作者…');
    try { recog.start(); } catch { setListening(false); }
  }

  async function voiceSearch(text: string) {
    try {
      const r = await fetch(`/api/poems/list?q=${encodeURIComponent(text)}&limit=10`);
      const list: PoemItem[] = await r.json();
      if (!list.length) { show(`未找到「${text}」相关诗篇，可念诗题或作者名`); return; }
      // 命中结果并入候选列表并选中，念完即可 Enter 生成注解
      setPoems((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...list.filter((p) => !ids.has(p.id)), ...prev];
      });
      abortRef.current?.abort();
      setSelected(list[0]);
      setStream(null);
      setFollowups([]);
      setFav(false);
      show(`识别到「${text}」· 已定位《${list[0].title}》，按 Enter 生成注解`);
    } catch {
      show('语音搜索失败，请重试');
    }
  }

  async function generate() {
    if (!selected || loading) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    setStream(null);
    setFollowups([]);
    setShowSteps(false);
    setSpeakingKey(null);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
        signal: ctrl.signal,
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
      if (e?.name === 'AbortError') {
        // 用户主动停止：保留已流式内容，标记完成态以便朗读/导出
        setStream((s) => (s ? { ...s, phase: 'done' } : s));
        show('已停止生成，保留已生成内容');
        return;
      }
      setError(e.message || '网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }

  /** 多轮追问：独立检索 + 引用硬约束，流式回答，可中途停止 */
  async function sendFollowup(question?: string) {
    const q = (question ?? fuInput).trim();
    if (!selected || !q || fuLoading) return;
    setFuInput('');
    const entry: Followup = { q, a: '', related: [], done: false };
    setFollowups((prev) => [...prev, entry]);
    const ctrl = new AbortController();
    fuAbortRef.current = ctrl;
    setFuLoading(true);
    let acc = '';
    const update = (patch: Partial<Followup>) =>
      setFollowups((prev) => prev.map((f, i) => (i === prev.length - 1 ? { ...f, ...patch } : f)));
    try {
      const r = await fetch('/api/annotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poemId: selected.id,
          question: q,
          // 此前问答作为上下文（不含本次问题，本次作为 question 独立检索）
          history: followups.flatMap((f) => [
            { role: 'user', content: f.q },
            { role: 'assistant', content: f.a },
          ]),
        }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || '追问失败');
      }
      for await (const { event, data } of sseEvents(r)) {
        if (event === 'delta') {
          acc += data.text || '';
          update({ a: acc });
        } else if (event === 'meta') {
          update({ related: data.related as RelatedPoem[] });
        } else if (event === 'error') {
          throw new Error(data.error || '追问失败');
        } else if (event === 'done') {
          update({ related: (data.related as RelatedPoem[]) || [], done: true });
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        update({ done: true });
        show('已停止追问，保留已生成内容');
        return;
      }
      update({ done: true });
      show(e?.message || '追问失败，请重试');
    } finally {
      setFuLoading(false);
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

  /** 导出水墨风分享图（PNG）：原诗 + 四维度注解 + 品牌页脚 */
  async function exportShare() {
    if (!shareRef.current || !selected || !stream || sharing) return;
    setSharing(true);
    try {
      await downloadSharePng(shareRef.current, `分享-注解-${selected.title}-${selected.author}.png`);
      show('已导出水墨分享图');
    } catch {
      show('分享图导出失败，请重试');
    } finally {
      setSharing(false);
    }
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
            <div className="flex gap-2">
              <select
                value={selected?.id || ''}
                onChange={(e) => {
                  abortRef.current?.abort();
                  setSelected(poems.find((p) => p.id === e.target.value) || null);
                  setStream(null);
                  setFollowups([]);
                  setFav(false);
                }}
                className="h-11 min-w-0 flex-1 rounded-lg border-[1.5px] border-c bg-white/70 px-3 font-ui text-sm outline-none transition-ink focus:border-ink-deep"
              >
                {poems.map((p) => (
                  <option key={p.id} value={p.id}>
                    《{p.title}》 {p.author}{p.hasAnnotation ? ' · 已有赏析' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={startVoiceSearch}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-ink ${listening ? 'anim-pulse-ring' : 'hover:bg-paper-dark'}`}
                style={listening ? { background: 'var(--rose)', color: '#fff' } : { background: 'var(--inset)', color: 'var(--ink-mid)' }}
                title={listening ? '正在聆听，再次点击取消' : '语音念诗：念诗题或作者即可定位'}
                aria-label="语音念诗搜索"
              >
                <Mic className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 font-ui text-xs text-ink-soft">
              {listening ? '正在聆听…请念诗题或作者' : '支持语音念诗：点麦克风念「静夜思」或「李白」试试'}
            </p>

            {selected && (
              <>
                <div className="relative mt-5 rounded-lg p-6" style={{ background: 'var(--inset)' }}>
                  <div className="absolute right-3 top-3 flex items-center gap-1">
                    <button
                      onClick={() => setVertical((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-ui text-xs text-ink-soft transition-ink hover:bg-white/70 hover:text-ink-deep"
                      title={vertical ? '切换为横排' : '切换为竖排（古籍样式）'}
                    >
                      {vertical ? '横排' : '竖排'}
                    </button>
                    <button
                      onClick={() => speak('poem', `${selected.title}。${selected.dynasty}代，${selected.author}。${selected.first}`)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-ui text-xs text-ink-soft transition-ink hover:bg-white/70 hover:text-ink-deep"
                      title="朗读原诗"
                    >
                      {speakingKey === 'poem' ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      {speakingKey === 'poem' ? '停止' : '朗读'}
                    </button>
                  </div>
                  <div className="text-center">
                    <span className={`dynasty-tag ${DYNASTY_CLASS[selected.dynasty] || 'dynasty-tang'}`}>{selected.dynasty}</span>
                    <h3 className="mt-2 font-brush text-2xl text-ink-deep">{selected.title}</h3>
                    <p className="mt-1 font-ui text-xs text-ink-soft">{selected.author}</p>
                  </div>
                  <div className="my-4 ink-divider" />
                  {vertical ? (
                    <div className="relative">
                      <div
                        className="mx-auto overflow-x-auto py-1 font-serif text-base text-ink-mid"
                        style={{ writingMode: 'vertical-rl', height: 300, letterSpacing: '0.3em' }}
                      >
                        {selected.first ? selected.first.split(/(?<=[，。？！；])/).filter(Boolean).map((l, i) => (
                          <p key={i} style={{ marginLeft: i === 0 ? 0 : '1.2em', lineHeight: 1.9 }}>{l}</p>
                        )) : <p>（无正文）</p>}
                      </div>
                      {/* 印章点缀 */}
                      <span
                        className="absolute bottom-1 left-1 flex h-9 w-9 flex-col items-center justify-center rounded font-brush text-[11px] leading-[1.1] text-white"
                        style={{ background: '#A67C7C', boxShadow: '0 1px 4px rgba(166,124,124,0.4)' }}
                      >
                        <span>墨</span><span>韵</span>
                      </span>
                    </div>
                  ) : (
                    <div className="text-center font-serif text-base leading-[2.5] text-ink-mid">
                      {selected.first ? selected.first.split(/(?<=[，。？！；])/).filter(Boolean).map((l, i) => <p key={i}>{l}</p>) : <p>（无正文）</p>}
                    </div>
                  )}
                </div>
                {selected.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.tags.slice(0, 4).map((t) => (
                      <span key={t} className="rounded-full bg-paper-dark px-2.5 py-0.5 font-ui text-xs text-ink-soft">{t}</span>
                    ))}
                  </div>
                )}
                <div className="mt-5 flex gap-3">
                  {loading ? (
                    <button
                      onClick={stopGenerate}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover"
                      style={{ background: '#A67C7C' }}
                      title="中断生成，保留已生成内容（Esc）"
                    >
                      <Square className="h-4 w-4" /> 停止生成
                    </button>
                  ) : (
                    <button
                      onClick={generate}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover"
                      style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
                      title="生成四维度 AI 注解（Enter）"
                    >
                      <Sparkles className="h-4 w-4" /> 生成AI注解
                    </button>
                  )}
                  <button
                    onClick={toggleFav}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border-[1.5px] border-c transition-ink hover:bg-paper-dark"
                    style={fav ? { borderColor: '#A67C7C', color: '#A67C7C' } : { color: 'var(--ink-soft)' }}
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
                <button onClick={generate} className="mt-4 rounded-lg px-5 py-2 font-ui text-sm text-white transition-ink" style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}>
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
                      style={{ borderLeft: '3px solid #8B7355', background: 'var(--inset)' }}
                    >
                      <div className="mb-1.5 flex items-center gap-1.5 font-ui text-xs font-medium text-ink-deep">
                        <Sparkles className="h-3.5 w-3.5 text-sepia" /> {d.tag}
                        {d.content && (
                          <button
                            onClick={() => speak(d.key, `${d.tag}。${d.content}`)}
                            className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-ui text-xs text-ink-soft transition-ink hover:bg-white/60 hover:text-ink-deep"
                            title="朗读本维度"
                          >
                            {speakingKey === d.key ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                            {speakingKey === d.key ? '停止' : '朗读'}
                          </button>
                        )}
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
                  <div className="rounded-lg p-4" style={{ border: '1px dashed var(--border-c)', background: 'rgba(123,142,161,0.05)' }}>
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
                  <div className="rounded-lg p-4" style={{ background: 'var(--inset)' }}>
                    <div className="mb-3 flex items-center gap-1.5 font-ui text-xs font-medium text-ink-deep">
                      <MessagesSquare className="h-3.5 w-3.5 text-muted-blue" /> 多轮追问 · 每次追问独立检索知识库，引用同样可追溯
                    </div>
                    <div className="space-y-3">
                      {followups.map((f, i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex justify-end">
                            <span className="max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 font-ui text-sm" style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}>{f.q}</span>
                          </div>
                          <div className="rounded-lg p-3 font-ui text-sm leading-relaxed text-ink-mid" style={{ borderLeft: '3px solid #6B8E7B', background: 'var(--paper-light)' }}>
                            {f.a ? (
                              renderWithCitations(f.a, f.related)
                            ) : (
                              <span className="inline-block spinner spinner-ink" style={{ width: 14, height: 14 }} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['诗中用了哪些典故？', '作者写这首诗有何背景？', '与之唱和的名篇还有哪些？'].map((c) => (
                        <button key={c} disabled={fuLoading} onClick={() => sendFollowup(c)} className="rounded-full border border-c bg-white/70 px-3 py-1 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-50">
                          {c}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={fuInput}
                        onChange={(e) => setFuInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) sendFollowup(); }}
                        placeholder="继续追问这首诗…（Enter 发送，Esc 停止）"
                        className="h-10 min-w-0 flex-1 rounded-lg border-[1.5px] border-c bg-white/70 px-3 font-ui text-sm outline-none transition-ink focus:border-ink-deep"
                      />
                      {fuLoading ? (
                        <button onClick={() => fuAbortRef.current?.abort()} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-4 font-ui text-xs font-medium transition-ink" style={{ background: 'var(--rose)', color: '#fff' }}>
                          <Square className="h-3.5 w-3.5" /> 停止
                        </button>
                      ) : (
                        <button onClick={() => sendFollowup()} disabled={!fuInput.trim()} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-4 font-ui text-xs font-medium transition-ink disabled:opacity-50" style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}>
                          追问
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {isDone && selected && (
                  <div className="rounded-lg p-4" style={{ background: 'var(--inset)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-ui text-xs font-medium text-ink-deep">
                        <Palette className="h-3.5 w-3.5 text-sepia" /> 水墨意境配图 · 按诗中意象自动生成
                      </div>
                      {inkUrl && !inkLoading && (
                        <button onClick={genInk} className="font-ui text-xs text-muted-blue transition-ink hover:underline">重新生成</button>
                      )}
                    </div>
                    {selected.tags.length > 0 && (
                      <p className="mt-1.5 font-ui text-xs text-ink-soft">
                        绘图灵感：{selected.tags.slice(0, 4).join('、')} ——「{selected.first.slice(0, 20)}…」
                      </p>
                    )}
                    {inkLoading && (
                      <div className="mt-3 flex h-40 items-center justify-center rounded-lg" style={{ background: 'var(--paper-light)' }}>
                        <span className="spinner spinner-ink" style={{ width: 20, height: 20 }} />
                        <span className="ml-2 font-ui text-xs text-ink-soft">CogView 正在挥毫…</span>
                      </div>
                    )}
                    {inkError && (
                      <p className="mt-3 font-ui text-xs" style={{ color: '#A67C7C' }}>
                        {inkError}{' '}
                        <button onClick={genInk} className="text-muted-blue transition-ink hover:underline">重试</button>
                      </p>
                    )}
                    {inkUrl && (
                      <img src={inkUrl} alt={`《${selected.title}》水墨意境图`} className="mt-3 w-full rounded-lg" loading="lazy" />
                    )}
                    {!inkUrl && !inkLoading && !inkError && (
                      <button
                        onClick={genInk}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3.5 py-2 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                      >
                        <Palette className="h-3.5 w-3.5" /> 生成意境配图
                      </button>
                    )}
                  </div>
                )}

                {isDone && (
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={exportMd}
                        className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                      >
                        <Download className="h-3.5 w-3.5" /> 导出 Markdown 报告
                      </button>
                      <button
                        onClick={exportShare}
                        disabled={sharing}
                        className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-60"
                        title="生成水墨风分享卡 PNG"
                      >
                        {sharing ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Share2 className="h-3.5 w-3.5" />}
                        分享图
                      </button>
                    </div>
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
      {/* 离屏分享卡：html2canvas 合成 PNG 用 */}
      {isDone && selected && (
        <div ref={shareRef} style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }} aria-hidden>
          <ShareCard
            kind="annotate"
            title={selected.title}
            subtitle={`〔${selected.dynasty}〕${selected.author}`}
            poemLines={selected.first ? selected.first.split(/(?<=[，。？！；])/).filter(Boolean).slice(0, 8) : ['（无正文）']}
            sections={stream.dims.map((d) => ({
              tag: d.tag,
              content: d.content.length > 140 ? `${d.content.slice(0, 140)}…` : d.content || '（无内容）',
            }))}
            image={inkUrl || undefined}
            footer={`${stream.model} · 耗时 ${((stream.latencyMs ?? 0) / 1000).toFixed(1)}s · ${new Date().toLocaleDateString('zh-CN')}`}
          />
        </div>
      )}
      <Toast msg={msg} />
    </div>
  );
}
