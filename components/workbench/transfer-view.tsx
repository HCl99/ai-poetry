'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Download, Volume2, Square, Image as ImageIcon, Share2 } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { sseEvents } from '@/lib/sse';
import { ShareCard, downloadSharePng } from './share-card';

const STYLES = [
  { key: 'libai', name: '李白体', hint: '浪漫飘逸 · 想象瑰奇' },
  { key: 'sushi', name: '苏轼体', hint: '旷达豪放 · 超然物外' },
  { key: 'wanyue', name: '婉约体', hint: '婉转含蓄 · 细腻缠绵' },
  { key: 'wangwei', name: '王维体', hint: '空灵静谧 · 诗中有画' },
  { key: 'dufu', name: '杜甫体', hint: '沉郁顿挫 · 忧国忧民' },
];

const EXAMPLE = '下雨天一个人走回家，路上想起了远方的朋友';

interface Meta { style: string; form: string; model: string; exemplars?: { title: string; score: number }[] }
interface DoneInfo { latencyMs: number; saved: boolean }

export function TransferView() {
  const [style, setStyle] = useState('sushi');
  const [text, setText] = useState(EXAMPLE);
  const [loading, setLoading] = useState(false);
  const [poem, setPoem] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [stepText, setStepText] = useState('');
  const [doneInfo, setDoneInfo] = useState<DoneInfo | null>(null);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [inkUrl, setInkUrl] = useState('');
  const [inkLoading, setInkLoading] = useState(false);
  const [inkError, setInkError] = useState(false);
  const [inkZoom, setInkZoom] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNoInk, setShareNoInk] = useState(false);
  const { msg, show } = useToast();
  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef(0);
  const shareRef = useRef<HTMLDivElement>(null);

  /** 中断当前流式生成，已生成内容保留 */
  function stopGenerate() {
    abortRef.current?.abort();
  }

  // 卸载时中断未完成的请求
  useEffect(() => () => abortRef.current?.abort(), []);

  // 快捷键：Esc 停止生成
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') abortRef.current?.abort();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Web Speech API 朗读生成诗词 */
  function speak() {
    if (!('speechSynthesis' in window)) { show('当前浏览器不支持语音合成'); return; }
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(poem);
    u.lang = 'zh-CN';
    u.rate = 0.85;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  /** CogView-3-Flash 生成水墨意境图 */
  async function inkpaint() {
    if (inkLoading || !poem) return;
    setInkLoading(true);
    setInkError(false);
    setInkUrl('');
    try {
      const r = await fetch('/api/inkpaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `${meta?.style || '古风'}诗词意境：${poem}` }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '生成失败');
      setInkUrl(d.url);
      show('水墨意境图已生成');
    } catch (e: any) {
      setInkError(true);
      show(e.message || '意境图生成失败，可重试');
    } finally {
      setInkLoading(false);
    }
  }

  async function generate() {
    if (loading) return;
    if (!text.trim()) { show('请输入现代文内容'); return; }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    startRef.current = Date.now();
    setLoading(true);
    setError('');
    setPoem('');
    setMeta(null);
    setDoneInfo(null);
    setStepText('');
    setInkUrl('');
    setInkError(false);
    setInkZoom(false);
    setShareNoInk(false);
    setSpeaking(false);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    try {
      const r = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, style }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || '生成失败');
      }
      for await (const { event, data } of sseEvents(r)) {
        if (event === 'meta') setMeta(data);
        else if (event === 'step') setStepText(data.detail || data.label || '');
        else if (event === 'delta') setPoem((p) => p + (data.text || ''));
        else if (event === 'error') throw new Error(data.error || '生成失败');
        else if (event === 'done') {
          setPoem(data.poem || '');
          setDoneInfo({ latencyMs: data.latencyMs, saved: !!data.saved });
          show('风格迁移完成');
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // 用户主动停止：保留已生成内容并进入完成态，便于朗读/导出/绘图
        setDoneInfo({ latencyMs: Date.now() - startRef.current, saved: false });
        show('已停止生成，保留已生成内容');
        return;
      }
      setError(e.message || '网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }

  /** 导出带检索范例出处的 Markdown 创作报告 */
  function exportMd() {
    if (!meta || !doneInfo || !poem) return;
    const styleName = STYLES.find((s) => s.key === style)?.name || meta.style;
    const lines: string[] = [
      '# 风格迁移创作报告',
      '',
      `> ${styleName} · ${meta.form || '古诗词'} · 墨韵诗心 AI 风格迁移 · 模型 ${meta.model} · 耗时 ${(doneInfo.latencyMs / 1000).toFixed(1)}s`,
      '',
      '## 现代文原文',
      '',
      text,
      '',
      '## 生成诗词',
      '',
      poem,
      '',
    ];
    if (meta.exemplars?.length) {
      lines.push('## RAG 向量检索风格范例', '');
      for (const e of meta.exemplars) {
        lines.push(`- 《${e.title}》（相似度 ${(e.score * 100).toFixed(0)}%）`);
      }
      lines.push('');
    }
    lines.push('---', `生成时间：${new Date().toLocaleString('zh-CN')}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `风格迁移-${styleName}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    show('已导出 Markdown 创作报告');
  }

  /** 导出水墨风分享图（PNG）：现代文 + 生成诗词 +（若有）意境图 */
  async function exportShare() {
    if (!shareRef.current || !poem || sharing) return;
    setSharing(true);
    const styleName = STYLES.find((s) => s.key === style)?.name || '古风';
    try {
      await downloadSharePng(shareRef.current, `分享-风格迁移-${styleName}-${Date.now()}.png`);
      show(shareNoInk ? '已导出分享图（意境图跨域受限，未包含）' : '已导出水墨分享图');
    } catch {
      // 意境图跨域导致画布受污染时，降级为不含图重试一次
      if (inkUrl && !shareNoInk) {
        setShareNoInk(true);
        await new Promise((r) => setTimeout(r, 100));
        try {
          await downloadSharePng(shareRef.current, `分享-风格迁移-${styleName}-${Date.now()}.png`);
          show('已导出分享图（意境图跨域受限，未包含）');
        } catch {
          show('分享图导出失败，请重试');
        }
      } else {
        show('分享图导出失败，请重试');
      }
    } finally {
      setSharing(false);
    }
  }

  const hasOutput = poem.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">风格迁移</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          AI 提取现代文意象、匹配诗人语言风格，逐句炼字，实时生成古风诗词
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左栏：输入与风格 */}
        <div className="paper-card p-6">
          <h2 className="mb-4 font-ui text-[15px] font-medium text-ink-deep">选择风格</h2>
          <div className="flex flex-wrap gap-2.5">
            {STYLES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStyle(s.key)}
                className="rounded-full border-[1.5px] px-4 py-2 font-ui text-sm transition-ink"
                style={
                  style === s.key
                    ? { background: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' }
                    : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }
                }
                title={s.hint}
              >
                {s.name}
              </button>
            ))}
          </div>
          <p className="mt-2.5 font-ui text-xs text-ink-soft">
            {STYLES.find((s) => s.key === style)?.hint}
          </p>

          <h2 className="mb-3 mt-6 font-ui text-[15px] font-medium text-ink-deep">输入现代文</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter 生成（Shift+Enter 换行），输入法组词期间不触发
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                generate();
              }
            }}
            placeholder="写下你想转化为古诗词的现代文…（Enter 生成，Shift+Enter 换行）"
            className="min-h-[120px] w-full resize-y rounded-lg border-[1.5px] border-c bg-white/60 p-4 font-ui text-sm leading-relaxed outline-none transition-ink focus:border-ink-deep"
          />
          <div className="mt-2 flex items-center justify-between">
            <button onClick={() => setText(EXAMPLE)} className="font-ui text-xs text-ink-soft transition-ink hover:text-ink-mid">
              填入示例
            </button>
            <span className="font-ui text-xs text-ink-soft/70">{text.length} 字</span>
          </div>

          {error && (
            <div className="mt-4 rounded-lg px-3 py-2 text-center font-ui text-sm" style={{ background: 'rgba(166,124,124,0.1)', color: '#A67C7C' }}>
              {error}
            </div>
          )}

          {loading ? (
            <button
              onClick={stopGenerate}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover"
              style={{ background: '#A67C7C' }}
              title="中断生成，保留已生成内容（Esc）"
            >
              <Square className="h-4 w-4" /> 停止生成
            </button>
          ) : (
            <button
              onClick={generate}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover"
              style={{ background: 'var(--btn-grad)' }}
              title="AI 逐句炼字生成古风诗词（Enter）"
            >
              <Sparkles className="h-4 w-4" /> 开始风格迁移
            </button>
          )}
        </div>

        {/* 右栏：生成结果（流式逐字） */}
        <div className="paper-card flex min-h-[420px] flex-col p-6">
          <h2 className="mb-4 font-ui text-[15px] font-medium text-ink-deep">生成结果</h2>

          {loading && !hasOutput && (
            <div className="flex flex-1 flex-col items-center justify-center py-16">
              <span className="spinner spinner-ink" style={{ width: 20, height: 20 }} />
              <p className="mt-4 font-ui text-sm text-ink-soft">AI 正在涵泳构思…</p>
              <p className="mt-1 font-ui text-xs text-ink-soft/70">{stepText || 'RAG 向量检索风格范例 · 逐句炼字'}</p>
            </div>
          )}

          {!loading && !hasOutput && (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <Sparkles className="h-12 w-12 text-ink-soft/40" strokeWidth={1.5} />
              <p className="mt-4 font-ui text-sm text-ink-soft">选择风格，输入现代文，点击「开始风格迁移」</p>
              <p className="mt-1 font-ui text-xs text-ink-soft/70">AI 将逐句把白话转化为对应诗人的古风诗词</p>
            </div>
          )}

          {hasOutput && (
            <div className="flex flex-1 flex-col anim-fade-in">
              <div className="flex flex-1 items-center justify-center rounded-lg p-8" style={{ background: 'var(--inset)' }}>
                <p className="whitespace-pre-line text-center font-serif text-lg leading-[2.6] text-ink-deep">
                  {poem}
                  {loading && <span className="ml-0.5 inline-block animate-pulse text-sepia">▍</span>}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between font-ui text-xs text-ink-soft">
                <span>{meta?.style ?? ''} · {meta?.form ?? '古诗词'}</span>
                {doneInfo ? (
                  <span>{meta?.model ?? 'glm-4-flash'} · {(doneInfo.latencyMs / 1000).toFixed(1)}s · {doneInfo.saved ? '已存入我的创作' : '未登录，未保存'}</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#6B8E7B' }} />
                    流式生成中
                  </span>
                )}
              </div>
              {meta?.exemplars && meta.exemplars.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 font-ui text-xs text-ink-soft/80">
                  <span>向量检索范例：</span>
                  {meta.exemplars.map((e) => (
                    <span key={e.title} className="rounded-full bg-white/70 px-2.5 py-0.5">
                      《{e.title}》<span className="ml-1 text-sepia">{(e.score * 100).toFixed(0)}%</span>
                    </span>
                  ))}
                </div>
              )}
              {doneInfo && (
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={speak}
                    className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                    title="朗读生成诗词"
                  >
                    {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    {speaking ? '停止' : '朗读'}
                  </button>
                  <button
                    onClick={inkpaint}
                    disabled={inkLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-60"
                    title="CogView-3 生成水墨意境图"
                  >
                    {inkLoading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <ImageIcon className="h-3.5 w-3.5" />}
                    {inkLoading ? '绘图中…' : '意境图'}
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
                  <button
                    onClick={exportMd}
                    className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                  >
                    <Download className="h-3.5 w-3.5" /> 导出 Markdown 报告
                  </button>
                </div>
              )}
              {(inkLoading || inkError || inkUrl) && (
                <div className="mt-3 overflow-hidden rounded-lg anim-fade-up" style={{ border: '1px solid var(--border-c)' }}>
                  {inkLoading && (
                    <div className="flex flex-col items-center justify-center py-14" style={{ background: 'var(--inset)' }}>
                      <span className="spinner spinner-ink" style={{ width: 20, height: 20 }} />
                      <p className="mt-3 font-ui text-xs text-ink-soft">CogView-3 正在晕染墨色，约 20 秒…</p>
                    </div>
                  )}
                  {inkError && !inkLoading && (
                    <div className="flex flex-col items-center justify-center py-10" style={{ background: 'var(--inset)' }}>
                      <ImageIcon className="h-8 w-8 text-ink-soft/40" strokeWidth={1.5} />
                      <p className="mt-2 font-ui text-xs" style={{ color: '#A67C7C' }}>意境图生成失败</p>
                      <button
                        onClick={inkpaint}
                        className="mt-3 rounded-lg px-4 py-1.5 font-ui text-xs text-white transition-ink hover:-translate-y-0.5"
                        style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
                      >
                        重试
                      </button>
                    </div>
                  )}
                  {inkUrl && !inkLoading && (
                    <>
                      <button onClick={() => setInkZoom(true)} className="block w-full cursor-zoom-in" title="点击放大">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={inkUrl} alt="水墨意境图" className="w-full object-cover" />
                      </button>
                      <p className="flex items-center justify-center gap-3 bg-white/60 px-3 py-1.5 font-ui text-xs text-ink-soft">
                        <span>CogView-3-Flash 水墨意境图 · 点击放大</span>
                        <a href={inkUrl} target="_blank" rel="noreferrer" className="text-muted-blue transition-ink hover:underline">查看原图</a>
                      </p>
                    </>
                  )}
                </div>
              )}
              {inkZoom && inkUrl && (
                <div
                  className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/70 p-6 anim-fade-in"
                  onClick={() => setInkZoom(false)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={inkUrl} alt="水墨意境图（放大）" className="max-h-full max-w-full rounded-lg" style={{ boxShadow: '0 16px 64px rgba(0,0,0,0.5)' }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* 离屏分享卡：html2canvas 合成 PNG 用 */}
      {doneInfo && poem && (
        <div ref={shareRef} style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }} aria-hidden>
          <ShareCard
            kind="transfer"
            title={`${STYLES.find((s) => s.key === style)?.name || '古风'} · 新作`}
            subtitle={`现代文 → 古风诗词 · ${meta?.form || '古诗词'}`}
            poemLines={poem.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8)}
            note={text.length > 90 ? `${text.slice(0, 90)}…` : text}
            image={inkUrl && !shareNoInk ? inkUrl : undefined}
            footer={`${meta?.model || 'glm-4-flash'} · ${new Date().toLocaleDateString('zh-CN')}`}
          />
        </div>
      )}
      <Toast msg={msg} />
    </div>
  );
}
