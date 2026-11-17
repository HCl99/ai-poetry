'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Star, Link as LinkIcon, BookOpen, Check, Download, Volume2, Square, Share2, Mic, MessagesSquare, AlertTriangle, History } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useSpeech } from '@/lib/use-speech';
import { sseEvents } from '@/lib/sse';
import { parseAnnotationSections } from '@/lib/sections';
import { ShareCard, downloadSharePng } from './share-card';
import { SpeechSettingsPanel } from './speech-panel';
import { AiStepsPanel } from './annotation/ai-steps-panel';
import { RelatedPoems } from './annotation/related-poems';

interface PoemItem {
  id: string; title: string; author: string; dynasty: string;
  first: string; tags: string[]; hasAnnotation: boolean;
}

/* ---- Web Speech API 最小类型声明（标准 DOM lib 未收录非标准 webkit 前缀） ---- */
interface SpeechRecognitionEventLike {
  results?: {
    [i: number]: { [j: number]: { transcript?: string }; isFinal?: boolean; length?: number };
  };
}
interface SpeechRecognitionErrorEventLike {
  error?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  /** Chromium 私有方法：立即终止识别（不触发 onend 兜底） */
  abort?(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}
type DimKey = 'zici' | 'diangu' | 'qinggan' | 'geli';
interface Dim { key: DimKey; tag: string; content: string; citation: string }
interface RelatedPoem { id: string; title: string; author: string; dynasty: string; score?: number | null; lines?: string[]; matchedLine?: number }
interface Step { label: string; detail?: string; tool?: string; ms?: number; hits?: number }
interface Followup { q: string; a: string; related: RelatedPoem[]; done: boolean }
interface StreamState {
  model: string;
  dims: Dim[];
  related: RelatedPoem[];
  steps: Step[];
  phase: 'retrieve' | 'generate' | 'done';
  latencyMs?: number;
  degraded?: boolean;
  cached?: boolean;
}

/** 引用归因高亮：《诗题》命中检索结果时可点击，跳到底部诗句定位 */
function renderWithCitations(
  text: string,
  related: RelatedPoem[],
  onCite?: (r: RelatedPoem) => void,
): React.ReactNode {
  const titles = new Map(related.map((r) => [r.title, r]));
  const parts = text.split(/(《[^》]{1,30}》)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const m = part.match(/^《([^》]{1,30})》$/);
    const hit = m ? titles.get(m[1]) : undefined;
    if (hit) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => onCite?.(hit)}
          title={`引用自检索相似诗篇：《${hit.title}》${hit.author}，点击定位原句`}
          className="rounded px-0.5 font-medium underline decoration-dotted underline-offset-2 transition-ink hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B8E7B]"
          style={{ background: 'rgba(107,142,123,0.18)', color: '#4E6E5D' }}
        >
          {part}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const DYNASTY_CLASS: Record<string, string> = {
  唐: 'dynasty-tang', 宋: 'dynasty-song', 元: 'dynasty-yuan', 明清: 'dynasty-mingqing',
};

/** 诗文按标点断句（朗读高亮与渲染共用，索引与 speakLines 队列偏移 1 对齐） */
function poemLinesOf(first: string) {
  return first ? first.split(/(?<=[，。？！；])/).filter(Boolean) : [];
}

export function AnnotateView() {
  const [poems, setPoems] = useState<PoemItem[]>([]);
  const [selected, setSelected] = useState<PoemItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [error, setError] = useState('');
  const [fav, setFav] = useState(false);
  const fullRef = useRef('');
  const [showSteps, setShowSteps] = useState(false);
  /** 当前展开的引用出处（点击正文《诗题》后定位原句） */
  const [cite, setCite] = useState<RelatedPoem | null>(null);
  const speech = useSpeech();
  const [vertical, setVertical] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { msg, show } = useToast();
  const abortRef = useRef<AbortController | null>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  // 语音念诗搜索：Web Speech Recognition，念诗题/作者即可定位诗篇
  const [listening, setListening] = useState(false);
  // 录音/识别状态提示（录音中、正在识别）
  const [asrStatus, setAsrStatus] = useState('');
  // 检索框内容：语音识别结果会写入这里，回车按全库检索
  const [query, setQuery] = useState('');
  const mediaRef = useRef<{ rec: MediaRecorder; stream: MediaStream; timer: ReturnType<typeof setTimeout> } | null>(null);
  // 多轮追问：每次追问独立检索知识库，引用硬约束与主注解一致
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [fuInput, setFuInput] = useState('');
  const [fuLoading, setFuLoading] = useState(false);
  const fuAbortRef = useRef<AbortController | null>(null);

  // 搜索无结果提示（不只是 toast，界面需明确告诉用户库里没有这首）
  const [notFound, setNotFound] = useState('');

  // 搜索历史：最近选择过的诗篇，持久化到 localStorage，刷新后仍可回看
  const [history, setHistory] = useState<PoemItem[]>([]);

  /** 把一首诗加入搜索历史（去重置顶，最多 10 条，持久化到 localStorage） */
  function addToHistory(p: PoemItem) {
    setHistory((prev) => {
      const next = [p, ...prev.filter((h) => h.id !== p.id)].slice(0, 10);
      try { localStorage.setItem('annotate-history', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // 启动时从 localStorage 恢复搜索历史
  useEffect(() => {
    try {
      const raw = localStorage.getItem('annotate-history');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setHistory(arr.slice(0, 10));
      }
    } catch { /* ignore */ }
  }, []);

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

  /** 朗读某一维度内容（跟随全局语速/音色设置），再次点击停止 */
  function readAloud(key: string, text: string) {
    if (!speech.supported) { show('当前浏览器不支持语音合成'); return; }
    speech.speak(key, text);
  }

  /** 朗读原诗：先题名/朝代/作者，再逐句朗读，当前句高亮 */
  function readPoem() {
    if (!selected) return;
    if (!speech.supported) { show('当前浏览器不支持语音合成'); return; }
    speech.speakLines('poem', [`${selected.title}。${selected.dynasty}代，${selected.author}。`, ...poemLinesOf(selected.first)]);
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
        const first = target || final[0] || null;
        setSelected(first);
        if (first) {
          setQuery(`《${first.title}》 ${first.author}`);
          addToHistory(first);
        }
      })
      .catch(() => setError('诗词列表加载失败'));
    // 卸载时停止录音
    return () => stopRecording();
  }, []);

  /**
   * 语音转文字：浏览器录音（MediaRecorder）→ /api/asr → 本地 faster-whisper 识别 → 写入检索框。
   * 不再依赖 Chrome 的 Web Speech（其识别要连 Google 服务，国内网络下必然失败）。
   * 点一次开始录音，说完再点一次结束；最长 10 秒自动结束。
   */
  async function startVoiceSearch() {
    if (listening) { stopRecording(); return; }
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      show('当前浏览器不支持录音，请使用 Chrome / Edge');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 1200) { setAsrStatus(''); show('没有录到声音，请靠近麦克风再试'); return; }
        setAsrStatus('正在识别…');
        try {
          const fd = new FormData();
          fd.append('audio', blob, 'voice.webm');
          const r = await fetch('/api/asr', { method: 'POST', body: fd });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || '语音识别失败');
          const text = String(d.text || '').trim();
          if (!text) { show('没听清，请再说一次'); return; }
          // 识别结果先写进输入框，再自动检索定位诗篇
          setQuery(text);
          show(`识别到「${text}」`);
          voiceSearch(text);
        } catch (e: unknown) {
          show(e instanceof Error ? e.message : '语音识别失败，请重试');
        } finally {
          setAsrStatus('');
        }
      };
      rec.start();
      mediaRef.current = { rec, stream, timer: setTimeout(() => stopRecording(), 10000) };
      setListening(true);
      setAsrStatus('录音中，说完再点一次麦克风');
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : '';
      show(name === 'NotAllowedError' ? '麦克风权限被拒绝，请在地址栏允许后重试' : '无法访问麦克风，请检查设备');
    }
  }

  /** 结束录音并触发识别 */
  function stopRecording() {
    const m = mediaRef.current;
    if (!m) return;
    clearTimeout(m.timer);
    mediaRef.current = null;
    if (m.rec.state !== 'inactive') m.rec.stop();
    setListening(false);
  }

  async function voiceSearch(text: string) {
    try {
      const r = await fetch(`/api/poems/list?q=${encodeURIComponent(text)}&limit=10`);
      const list: PoemItem[] = await r.json();
      if (!list.length) {
        // 无结果：清空当前选中诗篇与注解结果，只保留「暂无该数据」提示，
        // 避免旧诗卡还杵在那让用户误以为没反应
        abortRef.current?.abort();
        setSelected(null);
        setStream(null);
        setFollowups([]);
        setFav(false);
        setNotFound(text);
        show(`诗库中暂无「${text}」相关内容，请检查输入或换个关键词`);
        return;
      }
      // 有结果则清除无结果提示，并把命中诗篇并入候选
      setNotFound('');
      setPoems((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...list.filter((p) => !ids.has(p.id)), ...prev];
      });
      abortRef.current?.abort();
      setSelected(list[0]);
      setStream(null);
      setFollowups([]);
      setFav(false);
      addToHistory(list[0]);
      show(`已定位《${list[0].title}》，按 Enter 生成注解`);
    } catch {
      show('检索失败，请重试');
    }
  }

  /** 输入框里选中的候选诗篇 */
  function selectPoem(p: PoemItem) {
    abortRef.current?.abort();
    setSelected(p);
    setQuery(`《${p.title}》 ${p.author}`);
    setStream(null);
    setFollowups([]);
    setFav(false);
    setNotFound('');
    addToHistory(p);
  }

  // 输入框候选：本地 50 首之外的诗也要能搜到，改为防抖请求全库（按标题/作者匹配）
  const [suggestions, setSuggestions] = useState<PoemItem[]>([]);
  useEffect(() => {
    const q = query.replace(/[《》\s]/g, '');
    if (!q) { setSuggestions([]); return; }
    // 选中后输入框会被格式化成《题》 作者，此时不再请求
    if (query.startsWith('《')) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/poems/list?q=${encodeURIComponent(q)}&limit=8`);
        if (r.ok) setSuggestions(await r.json());
      } catch { /* 网络异常时保留上一次候选 */ }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function generate() {
    if (!selected || loading) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    setStream(null);
    setFollowups([]);
    setShowSteps(false);
    speech.stop();
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
            return {
              ...base,
              phase: 'retrieve',
              steps: [...base.steps, { label: data.label, detail: data.detail, tool: data.tool, ms: data.ms, hits: data.hits }],
            };
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
              ? { ...s, phase: 'done', latencyMs: data.latencyMs, dims: data.dimensions as Dim[], related: (data.related as RelatedPoem[]) || s.related, degraded: data.degraded as boolean | undefined, cached: data.cached as boolean | undefined }
              : s,
          );
          show('AI注解完成');
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // 用户主动停止：保留已流式内容，标记完成态以便朗读/导出
        setStream((s) => (s ? { ...s, phase: 'done' } : s));
        show('已停止生成，保留已生成内容');
        return;
      }
      setError(e instanceof Error ? e.message : '网络异常，请重试');
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
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        update({ done: true });
        show('已停止追问，保留已生成内容');
        return;
      }
      update({ done: true });
      show(e instanceof Error ? e.message : '追问失败，请重试');
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

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        {/* 左栏：诗词选择 */}
        <div className="space-y-5 lg:col-span-2">
          <div className="paper-card p-6">
            <h2 className="mb-3 font-ui text-[15px] font-medium text-ink-deep">选择诗词</h2>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); if (query.trim()) voiceSearch(query.trim()); }
                  }}
                  placeholder="输入或念出诗题 / 作者，回车检索"
                  className="h-11 w-full rounded-lg border-[1.5px] border-c bg-white/70 px-3 font-ui text-sm outline-none transition-ink focus:border-ink-deep"
                  aria-label="按诗题或作者检索诗词"
                />
                {suggestions.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-c bg-white py-1 shadow-lg">
                    {suggestions.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); selectPoem(p); }}
                          className="block w-full px-3 py-2 text-left font-ui text-sm text-ink-deep hover:bg-paper-dark"
                        >
                          《{p.title}》 <span className="text-ink-soft">{p.author}</span>
                          {p.hasAnnotation && <span className="ml-1 text-[11px] text-sepia">· 已有赏析</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={startVoiceSearch}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-ink ${listening ? 'anim-pulse-ring' : 'hover:bg-paper-dark'}`}
                style={listening ? { background: 'var(--rose)', color: '#fff' } : { background: 'var(--inset)', color: 'var(--ink-mid)' }}
                title={listening ? '正在聆听，再次点击取消' : '语音念诗：念诗题或作者，识别结果写入输入框'}
                aria-label="语音念诗搜索"
              >
                <Mic className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 font-ui text-xs text-ink-soft">
              {asrStatus || '点麦克风说话（说完再点一次结束），识别出的文字会写进上面的输入框；也可手动输入诗题 / 作者后回车检索'}
            </p>

            {/* 无结果提示：明确告诉用户诗库中没有该数据 */}
            {notFound && (
              <div className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 font-ui text-xs" style={{ background: 'color-mix(in srgb, var(--rose) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--rose) 30%, transparent)' }}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--rose)' }} />
                <div>
                  <span className="font-medium" style={{ color: 'var(--rose)' }}>诗库中暂无「{notFound}」相关数据</span>
                  <span className="text-ink-mid">。请检查输入是否有误，或尝试其他诗题 / 作者名。</span>
                </div>
              </div>
            )}

            {/* 搜索历史：最近查看过的诗篇，点击可快速回到 */}
            {history.length > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 font-ui text-xs font-medium text-ink-soft">
                  <History className="h-3.5 w-3.5" /> 最近看过
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => selectPoem(h)}
                      className="rounded-full border border-c bg-white/70 px-2.5 py-1 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                      title={`《${h.title}》 ${h.author}`}
                    >
                      《{h.title.length > 8 ? h.title.slice(0, 8) + '…' : h.title}》
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selected && (
              <>
                <div className="relative mt-5 max-h-[400px] overflow-y-auto rounded-lg p-6" style={{ background: 'var(--inset)' }}>
                  <div className="absolute right-3 top-3 flex items-center gap-1">
                    <button
                      onClick={() => setVertical((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-ui text-xs text-ink-soft transition-ink hover:bg-white/70 hover:text-ink-deep"
                      title={vertical ? '切换为横排' : '切换为竖排（古籍样式）'}
                    >
                      {vertical ? '横排' : '竖排'}
                    </button>
                    <button
                      onClick={readPoem}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-ui text-xs text-ink-soft transition-ink hover:bg-white/70 hover:text-ink-deep"
                      title="朗读原诗（当前句高亮）"
                    >
                      {speech.speakingKey === 'poem' ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      {speech.speakingKey === 'poem' ? '停止' : '朗读'}
                    </button>
                    <SpeechSettingsPanel settings={speech.settings} voices={speech.voices} onChange={speech.updateSettings} />
                  </div>
                  <div className="text-center">
                    <span className={`dynasty-tag ${DYNASTY_CLASS[selected.dynasty] || 'dynasty-tang'}`}>{selected.dynasty}</span>
                    <h3 className="mt-2 font-serif text-2xl font-medium text-ink-deep">{selected.title}</h3>
                    <p className="mt-1 font-ui text-xs text-ink-soft">{selected.author}</p>
                  </div>
                  <div className="my-4 ink-divider" />
                  {vertical ? (
                    <div className="relative">
                      {/* 每句一列竖排：外层不设 writing-mode，flex 才是横向排布；列高由内容决定，长诗自动换行，不再用固定 300px 高度 */}
                      <div className="flex flex-row-reverse flex-wrap items-start justify-center gap-x-3 gap-y-2 py-1">
                        {selected.first ? poemLinesOf(selected.first).map((l, i) => (
                          <p
                            key={i}
                            className="font-serif text-base text-ink-mid"
                            style={{
                              writingMode: 'vertical-rl',
                              letterSpacing: '0.18em',
                              lineHeight: 1.9,
                              ...(speech.speakingKey === 'poem' && speech.activeLine === i + 1
                                ? { background: 'rgba(107,142,123,0.18)', borderRadius: 4 }
                                : {}),
                            }}
                          >
                            {l}
                          </p>
                        )) : <p>（无正文）</p>}
                      </div>
                      {/* 印章点缀：放在诗列下方居中，不再绝对定位压住末列 */}
                      <span
                        className="mx-auto mt-3 flex h-9 w-9 flex-col items-center justify-center rounded font-brush text-[11px] leading-[1.1] text-white"
                        style={{ background: '#A67C7C', boxShadow: '0 1px 4px rgba(166,124,124,0.4)' }}
                      >
                        <span>墨</span><span>韵</span>
                      </span>
                    </div>
                  ) : (
                    <div className="text-center font-serif text-base leading-[2.5] text-ink-mid">
                      {selected.first ? poemLinesOf(selected.first).map((l, i) => (
                        <p key={i} style={speech.speakingKey === 'poem' && speech.activeLine === i + 1 ? { background: 'rgba(107,142,123,0.18)', borderRadius: 4 } : undefined}>{l}</p>
                      )) : <p>（无正文）</p>}
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
          <div className="paper-card flex min-h-[640px] flex-col p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-ui text-[15px] font-medium text-ink-deep">注解结果</h2>
              {stream && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-ui text-xs" style={{ background: 'rgba(107,142,123,0.15)', color: '#6B8E7B' }}>
                  <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse' : ''}`} style={{ background: '#6B8E7B' }} />
                  {stream.phase === 'retrieve' ? '向量检索中' : stream.phase === 'generate' ? 'AI 撰写中' : 'AI 生成 · 引用可追溯'}
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
                {/* 屏幕阅读器播报：生成阶段与完成结果（视觉上隐藏） */}
                <div aria-live="polite" aria-atomic="true" className="sr-only">
                  {loading
                    ? '正在生成四维度注解，已进入' + (stream.phase === 'retrieve' ? '检索阶段' : '生成阶段')
                    : isDone
                      ? `注解完成，检索命中 ${stream.related.length} 篇，共 ${stream.steps.length} 步工具调用`
                      : ''}
                </div>
                {/* 完成后可回看检索与思考过程 */}
                {isDone && stream.steps.length > 0 && (
                  <button
                    onClick={() => setShowSteps((v) => !v)}
                    className="font-ui text-xs text-muted-blue transition-ink hover:underline"
                  >
                    {showSteps ? '收起思考轨迹 ▲' : `查看思考轨迹（${stream.steps.length} 步）▼`}
                  </button>
                )}

                {/* AI 链路：从向量化 → 检索 → 精排 → 小传 → 生成，逐步展示所用技术 */}
                {stream.steps.length > 0 && (loading || showSteps) && (
                  <AiStepsPanel
                    steps={stream.steps}
                    model={stream.model}
                    related={stream.related}
                    latencyMs={stream.latencyMs}
                    phase={stream.phase}
                    loading={loading}
                  />
                )}

                {/* 缓存命中提示 */}
                {stream.cached && (
                  <div className="mb-4 flex items-center gap-2 rounded-lg px-3.5 py-2.5 font-ui text-xs" style={{ background: 'color-mix(in srgb, var(--sage) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--sage) 30%, transparent)' }}>
                    <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--sage)' }} />
                    <span className="font-medium" style={{ color: 'var(--sage)' }}>命中注解缓存</span>
                    <span className="text-ink-mid">，本次结果为该诗历史注解，秒级返回。</span>
                  </div>
                )}

                {/* 降级提示：向量检索不可用时显式告知用户 */}
                {stream.degraded && !stream.cached && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg px-3.5 py-2.5 font-ui text-xs" style={{ background: 'color-mix(in srgb, var(--sepia) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--sepia) 30%, transparent)' }}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--sepia)' }} />
                    <div>
                      <span className="font-medium" style={{ color: 'var(--sepia-dark)' }}>向量检索服务暂不可用</span>
                      <span className="text-ink-mid">，本次注解已降级为「意象共现检索」，引用精度可能略低。可在本地启动 BGE 嵌入服务恢复向量检索。</span>
                    </div>
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
                            onClick={() => readAloud(d.key, `${d.tag}。${d.content}`)}
                            className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-ui text-xs text-ink-soft transition-ink hover:bg-white/60 hover:text-ink-deep"
                            title="朗读本维度"
                          >
                            {speech.speakingKey === d.key ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                            {speech.speakingKey === d.key ? '停止' : '朗读'}
                          </button>
                        )}
                      </div>
                      {d.content ? (
                        <p className="font-ui text-[15px] leading-relaxed text-ink-mid">
                          {renderWithCitations(d.content, stream.related, setCite)}
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
                <RelatedPoems related={stream.related} />

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
                              renderWithCitations(f.a, f.related, setCite)
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

                {/* 引用出处：点击正文《诗题》后定位到原句 */}
                {cite && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 anim-fade-in"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`引用出处《${cite.title}》`}
                    onClick={() => setCite(null)}
                  >
                    <div
                      className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl p-5"
                      style={{ background: 'var(--paper-light)', boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="mb-1 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-poem text-lg text-ink-deep">《{cite.title}》</p>
                          <p className="font-ui text-xs text-ink-soft">〔{cite.dynasty}〕{cite.author}</p>
                        </div>
                        <button
                          onClick={() => setCite(null)}
                          className="rounded px-2 py-1 font-ui text-xs text-ink-soft transition-ink hover:bg-paper-dark"
                        >
                          关闭
                        </button>
                      </div>
                      <p className="mb-3 font-ui text-[11px] text-ink-soft/80">
                        按与本诗的字面重合度定位，高亮行是最相关的一句
                      </p>
                      <ol className="space-y-1.5">
                        {(cite.lines || []).map((ln, i) => (
                          <li
                            key={i}
                            className="rounded px-2 py-1 font-poem text-[15px] leading-relaxed"
                            style={
                              i === cite.matchedLine
                                ? { background: 'rgba(107,142,123,0.18)', color: '#3F5A4A', fontWeight: 600 }
                                : { color: 'var(--ink-mid, #4A4A4A)' }
                            }
                          >
                            {ln}
                          </li>
                        ))}
                        {!cite.lines?.length && (
                          <li className="font-ui text-xs text-ink-soft">该篇逐句文本暂未载入</li>
                        )}
                      </ol>
                    </div>
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
            footer={`${stream.model} · 耗时 ${((stream.latencyMs ?? 0) / 1000).toFixed(1)}s · ${new Date().toLocaleDateString('zh-CN')}`}
          />
        </div>
      )}
      <Toast msg={msg} />
    </div>
  );
}
