'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Eye, ImagePlus, RotateCcw, Search, Sparkles, UploadCloud } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { AiBadge } from '@/components/ai-badge';

interface Analysis {
  imagery: string[];
  mood: string;
  scene: string;
  keywords: string[];
  /** 最终用于查库的意象字（含「明月→月」拆字回退后的结果） */
  lookupChars?: string[];
}

interface MatchedPoem {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  excerpt: string;
  /** 该诗实际命中的意象字 */
  matchedChars?: string[];
  /** 命中意象两两共现权重之和（排序依据之一） */
  coocScore?: number;
}

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 1600; // 客户端压缩：最大边不超过 1600px，减少上传与识别耗时

/** 客户端压缩：最大边缩到 1600px，输出 JPEG，避免大图上传慢 */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas 不可用')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = String(fr.result);
    };
    fr.onerror = () => reject(new Error('读取失败'));
    fr.readAsDataURL(file);
  });
}

const EXAMPLES = ['月下江面与一叶孤舟', '雨后青山云雾缭绕', '雪中寒梅数枝', '春日柳岸飞燕'];

/** 推理链各段之间的纯 CSS 连接线 + 箭头 */
function ChainConnector() {
  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      <span className="h-5 w-px" style={{ background: 'var(--border-c)' }} />
      <span
        className="h-0 w-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent"
        style={{ borderTopColor: 'var(--border-c)' }}
      />
    </div>
  );
}

export function VisionView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [image, setImage] = useState('');
  const [fileName, setFileName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [poems, setPoems] = useState<MatchedPoem[]>([]);
  const { msg, show } = useToast();

  useEffect(() => () => abortRef.current?.abort(), []);

  function pick() {
    if (busy) return;
    inputRef.current?.click();
  }

  async function readFile(file: File) {
    if (!ACCEPT.includes(file.type)) {
      setError('仅支持 PNG / JPEG / WebP 格式的图片，请重新选择');
      show('图片格式不支持');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('图片超过 4MB，请压缩后再上传');
      show('图片过大');
      return;
    }
    try {
      const dataUrl = await compressImage(file);
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) {
        setError('图片读取失败，请换一张图片重试');
        return;
      }
      abortRef.current?.abort();
      setImage(dataUrl);
      setFileName(file.name);
      setError('');
      setAnalysis(null);
      setPoems([]);
    } catch {
      setError('图片读取失败，请换一张图片重试');
    }
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void readFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void readFile(file);
  }

  async function analyze() {
    if (busy || !image) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setError('');
    setAnalysis(null);
    setPoems([]);
    try {
      const r = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, note: note.trim() || undefined }),
        signal: ctrl.signal,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '识图失败，请稍后重试');
      setAnalysis(d.analysis || null);
      setPoems(Array.isArray(d.poems) ? d.poems : []);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setError(e?.message || '识图失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setImage('');
    setFileName('');
    setNote('');
    setError('');
    setAnalysis(null);
    setPoems([]);
    setBusy(false);
  }

  /* ---- 推理链派生数据（仅依赖接口返回，不再额外查询） ---- */
  const lookupChars = analysis?.lookupChars ?? [];
  // 拆字回退：识别词整体不在库，但其单字参与了查库（如「明月」→「月」）
  const fallbacks = analysis
    ? analysis.imagery
        .filter((t) => !lookupChars.includes(t))
        .map((t) => ({ term: t, chars: [...t].filter((c) => lookupChars.includes(c)) }))
        .filter((f) => f.chars.length > 0)
    : [];
  // 各意象字在结果诗篇中的命中篇数（由 matchedChars 并集推断）
  const hitCount = (ch: string) => poems.filter((p) => p.matchedChars?.includes(ch)).length;
  // 共现权重归一化为 1-3 档强度（全为 0 时返回 0，表示无共现信息）
  const maxCooc = Math.max(0, ...poems.map((p) => p.coocScore ?? 0));
  const coocLevel = (score: number) => (maxCooc > 0 ? Math.max(1, Math.ceil((score / maxCooc) * 3)) : 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">以图搜诗</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          上传一张风景 / 绘画照片，GLM-4V 识别画面意象，反查 33 万首诗词中意境相近的篇章
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 上传区 */}
        <div className="paper-card p-5 md:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
              <ImagePlus className="h-4 w-4 text-sage" /> 上传图片
            </h2>
            {image && (
              <button onClick={reset} disabled={busy} className="font-ui text-xs text-ink-soft transition-ink hover:text-ink-deep disabled:opacity-50">
                清空
              </button>
            )}
          </div>

          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onSelect} />
          <div
            role="button"
            tabIndex={0}
            aria-label="点击或拖拽上传图片"
            onClick={pick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className="relative flex min-h-[240px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed p-3 transition-ink"
            style={{
              borderColor: dragging ? 'var(--sage)' : 'var(--border-c)',
              background: dragging ? 'color-mix(in srgb, var(--sage) 10%, var(--inset))' : 'var(--inset)',
            }}
          >
            {image ? (
              <div className="flex w-full flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="待分析图片预览" className="max-h-[320px] w-full rounded-lg object-contain" />
                <span className="max-w-full truncate font-ui text-xs text-ink-soft">{fileName}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--muted-blue) 14%, transparent)', color: 'var(--muted-blue)' }}>
                  <UploadCloud className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-ui text-sm text-ink-deep">点击选择，或将图片拖拽到此处</p>
                  <p className="mt-1 font-ui text-xs text-ink-soft">支持 PNG / JPEG / WebP，大小不超过 4MB</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={80}
              disabled={busy}
              placeholder="补充说明（可选），如拍摄地点、画面事物…"
              className="h-10 w-full rounded-lg border border-c px-3 font-ui text-sm text-ink-deep outline-none transition-ink focus:border-ink-mid disabled:opacity-60"
              style={{ background: 'var(--paper-light)' }}
            />
            <button
              onClick={analyze}
              disabled={!image || busy}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-5 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
            >
              {busy ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Sparkles className="h-4 w-4" />}
              {busy ? 'AI 正在观画…' : '开始识别'}
            </button>
          </div>
          <p className="mt-2 font-ui text-[11px] leading-relaxed text-ink-soft">
            「开始识别」每 5 次/分钟，图片仅在本次请求中用于识别，不会保存。
          </p>
        </div>

        {/* 推理链 · 段1：识图（GLM-4V 识别结果） */}
        <div className="paper-card p-5 md:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
              <Eye className="h-4 w-4 text-muted-blue" /> 壹 · 识图
            </h2>
            <AiBadge label="GLM-4V 识图" />
          </div>

          {busy && (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <span className="spinner spinner-ink" style={{ width: 24, height: 24 }} />
              <p className="font-ui text-sm text-ink-deep">AI 正在观画…</p>
              <p className="font-ui text-xs text-ink-soft">GLM-4V 正在识别画面意象与情绪氛围</p>
            </div>
          )}

          {!busy && error && (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <AlertCircle className="h-7 w-7" style={{ color: 'var(--rose)' }} />
              <p className="max-w-xs font-ui text-sm leading-relaxed text-ink-mid">{error}</p>
              <button
                onClick={() => (image ? void analyze() : pick())}
                className="inline-flex items-center gap-1.5 rounded-lg border border-c px-4 py-2 font-ui text-xs text-ink-deep transition-ink hover:border-ink-mid hover:bg-paper-dark"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {image ? '重试' : '重新选择图片'}
              </button>
            </div>
          )}

          {!busy && !error && analysis && (
            <div className="anim-fade-up space-y-4">
              <div>
                <div className="mb-2 font-ui text-[11px] tracking-wide text-ink-soft">意象</div>
                {analysis.imagery.length ? (
                  <div className="flex flex-wrap gap-2">
                    {analysis.imagery.map((im) => (
                      <span
                        key={im}
                        className="rounded-full px-3 py-1 font-brush text-lg leading-none"
                        style={{ background: 'color-mix(in srgb, var(--sage) 14%, transparent)', color: 'color-mix(in srgb, var(--sage) 72%, var(--ink-deep))' }}
                      >
                        {im}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="font-ui text-sm text-ink-soft">画面中未识别到明确的诗词意象</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg p-3" style={{ background: 'var(--inset)' }}>
                  <div className="font-ui text-[11px] text-ink-soft">情绪</div>
                  <p className="mt-1 font-ui text-sm text-ink-deep">{analysis.mood || '—'}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'var(--inset)' }}>
                  <div className="font-ui text-[11px] text-ink-soft">场景</div>
                  <p className="mt-1 font-ui text-sm leading-relaxed text-ink-deep">{analysis.scene || '—'}</p>
                </div>
              </div>

              <div>
                <div className="mb-2 font-ui text-[11px] tracking-wide text-ink-soft">关键词</div>
                {analysis.keywords.length ? (
                  <div className="flex flex-wrap gap-2">
                    {analysis.keywords.map((k) => (
                      <span
                        key={k}
                        className="rounded-full px-2.5 py-1 font-ui text-xs"
                        style={{ background: 'color-mix(in srgb, var(--muted-blue) 13%, transparent)', color: 'color-mix(in srgb, var(--muted-blue) 72%, var(--ink-deep))' }}
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="font-ui text-sm text-ink-soft">—</p>
                )}
              </div>
              <p className="border-t border-light pt-3 font-ui text-[11px] leading-relaxed text-ink-soft">
                识别结果由 GLM-4V 生成，仅描述画面可见内容；诗篇匹配基于库内意象关联。
              </p>
            </div>
          )}

          {!busy && !error && !analysis && (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--muted-blue) 12%, transparent)', color: 'var(--muted-blue)' }}>
                <Eye className="h-5 w-5" />
              </span>
              <p className="font-ui text-sm text-ink-deep">识别结果将显示在这里</p>
              <div className="max-w-sm">
                <p className="font-ui text-xs leading-relaxed text-ink-soft">还没有图片，试试上传这些画面：</p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <span key={ex} className="rounded-full px-2.5 py-1 font-ui text-[11px] text-ink-soft" style={{ background: 'var(--inset)' }}>
                      {ex}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 推理链 · 段2：意象反查（库内检索过程透明化） */}
      {!busy && analysis && (
        <>
          <ChainConnector />
          <section className="paper-card anim-fade-up p-5 md:p-6" style={{ animationDelay: '0.05s' }}>
            <h2 className="mb-3 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
              <Search className="h-4 w-4 text-sage" /> 贰 · 意象反查
            </h2>

            {lookupChars.length ? (
              <div className="space-y-3">
                <p className="font-ui text-sm leading-relaxed text-ink-mid">
                  以 <span className="font-medium text-ink-deep">{lookupChars.length}</span> 个意象字检索全库意象标注：
                </p>
                <div className="flex flex-wrap gap-2">
                  {lookupChars.map((ch) => (
                    <span
                      key={ch}
                      className="rounded-full px-3 py-1 font-brush text-lg leading-none"
                      style={{ background: 'color-mix(in srgb, var(--sage) 14%, transparent)', color: 'color-mix(in srgb, var(--sage) 72%, var(--ink-deep))' }}
                    >
                      {ch}
                    </span>
                  ))}
                </div>

                {/* 拆字回退说明：识别词整体不在库，按单字命中 */}
                {fallbacks.length > 0 && (
                  <p className="font-ui text-[11px] leading-relaxed text-ink-soft">
                    {fallbacks.map((f) => `「${f.term}」未直接收录，按单字「${f.chars.join('」「')}」检索`).join('；')}
                  </p>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-light pt-3">
                  {lookupChars.map((ch) => (
                    <span key={ch} className="font-ui text-[11px] text-ink-soft">
                      「{ch}」命中 <span className="text-ink-mid">{hitCount(ch)}</span> 篇
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="font-ui text-sm leading-relaxed text-ink-soft">
                {analysis.imagery.length
                  ? '识别出的意象未在库内意象标注中出现，无法反查诗篇。'
                  : '画面中未识别到明确的诗词意象，未执行库内反查。'}
              </p>
            )}
          </section>
        </>
      )}

      {/* 推理链 · 段3：命中诗篇（排序依据透明化） */}
      {!busy && analysis && (
        <>
          <ChainConnector />
          <section className="anim-fade-up" style={{ animationDelay: '0.08s' }}>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="font-brush text-2xl text-ink-black">叁 · 命中诗篇</h2>
                <p className="mt-1 font-ui text-xs text-ink-soft">
                  {poems.length ? `按命中意象数 → 共现权重排序 · 共 ${poems.length} 篇` : '库内意象关联检索结果'}
                </p>
              </div>
            </div>

          {poems.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {poems.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/workbench/poem/${p.id}`}
                  className="paper-card paper-card-hover anim-fade-up group flex flex-col p-5 transition-ink"
                  style={{ animationDelay: `${0.05 + i * 0.04}s` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-serif text-lg leading-snug text-ink-deep">《{p.title}》</h3>
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 -translate-x-1 text-ink-soft opacity-0 transition-ink group-hover:translate-x-0 group-hover:opacity-100" />
                  </div>
                  <p className="mt-1 font-ui text-xs text-ink-soft">〔{p.dynasty}〕{p.author}</p>
                  <p className="mt-3 line-clamp-2 font-serif text-sm leading-relaxed text-ink-mid">{p.excerpt || '暂无节选'}</p>

                  {/* 命中依据：命中意象 chips + 共现强度墨点 + 排序说明 */}
                  {p.matchedChars && p.matchedChars.length > 0 && (
                    <div className="mt-3 border-t border-light pt-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="font-ui text-[10px] tracking-wide text-ink-soft">命中意象</span>
                        <span className="flex items-center gap-0.5 text-[9px] leading-none" title={`共现权重 ${p.coocScore ?? 0}`} aria-label={`共现强度 ${coocLevel(p.coocScore ?? 0)} / 3`}>
                          {[1, 2, 3].map((n) => (
                            <span key={n} style={{ color: n <= coocLevel(p.coocScore ?? 0) ? 'var(--sage)' : 'var(--border-c)' }}>●</span>
                          ))}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.matchedChars.map((ch) => (
                          <span
                            key={ch}
                            className="rounded-full px-2 py-0.5 font-ui text-[11px] leading-none"
                            style={{ background: 'color-mix(in srgb, var(--sage) 12%, transparent)', color: 'color-mix(in srgb, var(--sage) 72%, var(--ink-deep))' }}
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 font-ui text-[10px] leading-relaxed text-ink-soft">
                        命中 {p.matchedChars.length} 意象 · 共现权重 {p.coocScore ?? 0}
                      </p>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="paper-card flex flex-col items-center gap-2 p-10 text-center">
              <p className="font-ui text-sm text-ink-deep">未在库内找到与这些意象直接关联的诗篇</p>
              <p className="font-ui text-xs leading-relaxed text-ink-soft">
                当前意象在诗词意象库中暂无关联，可换一张意象更明确的风景 / 绘画照片重试。
              </p>
              <button onClick={pick} className="mt-1 inline-flex items-center gap-1.5 font-ui text-xs text-muted-blue transition-ink hover:underline">
                <RotateCcw className="h-3.5 w-3.5" /> 重新选择图片
              </button>
            </div>
          )}
          </section>
        </>
      )}

      <Toast msg={msg} />
    </div>
  );
}
