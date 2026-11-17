'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Download, Volume2, Square, Share2, ScrollText, Cpu } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useSpeech } from '@/lib/use-speech';
import { AiBadge } from '@/components/ai-badge';
import { sseEvents } from '@/lib/sse';
import { ShareCard, downloadSharePng } from './share-card';
import { ScrollCard } from './scroll-card';
import { SpeechSettingsPanel } from './speech-panel';
import { checkMeter, meterFormFor, type MeterReport } from '@/lib/meter';
import type { EmotionKey } from '@/lib/voice-presets';

/** 生成风格 → 朗读情感音色，让朗读语气与诗人气质一致 */
const EMOTION_BY_STYLE: Record<string, EmotionKey> = {
  libai: 'heroic',
  sushi: 'broad',
  wanyue: 'gentle',
  wangwei: 'serene',
  dufu: 'melancholy',
};

/** 风格 ↔ 体裁一一对应：唐代诗人作诗（绝句/律诗），宋代词人作词（指定词牌） */
const STYLES = [
  { key: 'libai', name: '李白体', form: '七言绝句', hint: '浪漫飘逸 · 想象瑰奇' },
  { key: 'sushi', name: '苏轼体', form: '豪放词 · 定风波', hint: '旷达豪放 · 超然物外' },
  { key: 'wanyue', name: '婉约体', form: '婉约词 · 浣溪沙', hint: '婉转含蓄 · 细腻缠绵' },
  { key: 'wangwei', name: '王维体', form: '五言绝句', hint: '空灵静谧 · 诗中有画' },
  { key: 'dufu', name: '杜甫体', form: '七言律诗', hint: '沉郁顿挫 · 忧国忧民' },
];

const EXAMPLE = '下雨天一个人走回家，路上想起了远方的朋友';


interface Meta { style: string; form: string; model: string; exemplars?: { title: string; score: number }[] }
interface DoneInfo { latencyMs: number; saved: boolean }
/** 格律后校验报告（done 事件精简版）：pass/rhymeOk/pingzeOk + 每句违规描述 */
interface MeterInfo { pass: boolean; rhymeOk: boolean; pingzeOk: boolean; lines: string[][] }

export function TransferView() {
  const [style, setStyle] = useState('sushi');
  const [text, setText] = useState(EXAMPLE);
  const [loading, setLoading] = useState(false);
  const [poem, setPoem] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [steps, setSteps] = useState<{ label: string; detail: string }[]>([]);
  const [doneInfo, setDoneInfo] = useState<DoneInfo | null>(null);
  const [meter, setMeter] = useState<MeterInfo | null>(null);
  const [clientMeter, setClientMeter] = useState<MeterReport | null>(null);
  const [error, setError] = useState('');
  const speech = useSpeech();
  const [sharing, setSharing] = useState(false);
  const [scrollExporting, setScrollExporting] = useState(false);
  const { msg, show } = useToast();
  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef(0);
  const shareRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  /** 朗读生成诗词（跟随全局语速/音色设置，按所选诗人风格选择情感音色，逐句断句朗读） */
  function speak() {
    if (!speech.supported) { show('当前浏览器不支持语音合成'); return; }
    if (!poem) return;
    const lines = poem.split('\n').map((l) => l.trim()).filter(Boolean);
    speech.speakLines('transfer-poem', lines, EMOTION_BY_STYLE[style]);
  }

  /** 端侧格律校验：纯浏览器本地运行，无需网络请求（端侧智能引擎） */
  function runClientMeter() {
    if (!poem) return;
    const lines = poem.split('\n').map((l) => l.replace(/[，。！？、；：\s]/g, '')).filter(Boolean);
    if (lines.length === 0) return;
    const shape = lines.map((l) => l.length);
    const form = meterFormFor(shape, '诗');
    const report = checkMeter(lines, form);
    setClientMeter(report);
    show(report.pass ? '端侧格律校验通过 ✓' : '端侧格律校验完成，存在待优化处 ⚠');
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
    setMeter(null);
    setClientMeter(null);
    setSteps([]);
    speech.stop();
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
        else if (event === 'step') setSteps((prev) => [...prev, { label: data.label || '', detail: data.detail || '' }]);
        else if (event === 'delta') setPoem((p) => p + (data.text || ''));
        else if (event === 'error') throw new Error(data.error || '生成失败');
        else if (event === 'done') {
          setPoem(data.poem || '');
          setDoneInfo({ latencyMs: data.latencyMs, saved: !!data.saved });
          setMeter(data.meter || null);
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
      show('已导出分享图');
    } catch {
      show('分享图导出失败，请重试');
    } finally {
      setSharing(false);
    }
  }

  /** 导出诗画长卷 PNG：竖排右起诗句 + 题签印章 */
  async function exportScroll() {
    if (!scrollRef.current || !poem || scrollExporting) return;
    setScrollExporting(true);
    const styleName = STYLES.find((s) => s.key === style)?.name || '古风';
    try {
      await downloadSharePng(scrollRef.current, `诗画长卷-${styleName}-${Date.now()}.png`);
      show('已导出诗画长卷');
    } catch {
      show('长卷导出失败，请重试');
    } finally {
      setScrollExporting(false);
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
                title={`${s.hint} · 体裁：${s.form}`}
              >
                {s.name}
                <span className="ml-1.5 font-ui text-[11px] opacity-70">{s.form}</span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 font-ui text-xs text-ink-soft">
            {STYLES.find((s) => s.key === style)?.hint}
            <span className="ml-2 text-sepia">体裁：{STYLES.find((s) => s.key === style)?.form}</span>
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
            placeholder="写一个场景或心情，例如：深夜独坐窗前，看见月亮想起故乡（Enter 生成，Shift+Enter 换行）"
            className="min-h-[120px] w-full resize-y rounded-lg border-[1.5px] border-c bg-white/60 p-4 font-ui text-sm leading-relaxed outline-none transition-ink focus:border-ink-deep"
          />
          <div className="mt-2 flex items-center justify-between">
            <button onClick={() => setText(EXAMPLE)} className="font-ui text-xs text-ink-soft transition-ink hover:text-ink-mid">
              填入示例
            </button>
            <span className="font-ui text-xs text-ink-soft/70">{text.length} 字</span>
          </div>
          {text.trim().length > 0 && text.trim().length < 6 && (
            <p className="mt-2 font-ui text-xs" style={{ color: '#A67C7C' }}>
              再写一点：至少 6 个字，说明场景或心情（只写「月亮」模型无从提炼，只能瞎猜）
            </p>
          )}

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
              disabled={text.trim().length < 6}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              style={{ background: 'var(--btn-grad)' }}
              title={text.trim().length < 6 ? '至少写 6 个字，说明场景或心情' : 'AI 逐句炼字生成古风诗词（Enter）'}
            >
              <Sparkles className="h-4 w-4" /> 开始风格迁移
            </button>
          )}
        </div>

        {/* 右栏：生成结果（流式逐字） */}
        <div className="paper-card flex min-h-[420px] flex-col p-6">
          <h2 className="mb-4 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            生成结果 {hasOutput && <AiBadge label="AI 生成 · 仅供参考" />}
          </h2>

          {loading && !hasOutput && (
            <div className="flex flex-1 flex-col items-center justify-center py-16">
              <span className="spinner spinner-ink" style={{ width: 20, height: 20 }} />
              <p className="mt-4 font-ui text-sm text-ink-soft">AI 正在涵泳构思…</p>

              {/* 阶段条：检索 → 起草 → 校验 → 第 N 稿重写 */}
              {steps.length > 0 && (
                <ol className="mt-5 w-full max-w-md space-y-2 px-4">
                  {steps.map((s, i) => {
                    const isLast = i === steps.length - 1;
                    return (
                      <li key={i} className="flex items-start gap-2.5">
                        <span
                          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                          style={{
                            background: isLast ? 'var(--sepia)' : 'var(--sage)',
                            color: 'var(--paper-light)',
                          }}
                        >
                          {isLast ? '…' : '✓'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`font-ui text-xs ${isLast ? 'font-medium text-ink-deep' : 'text-ink-soft'}`}>{s.label}</p>
                          {s.detail && (
                            <p className="mt-0.5 truncate font-ui text-[11px] text-ink-soft/70" title={s.detail}>{s.detail}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
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
              {/* 端侧格律校验结果面板（浏览器本地即时计算，无网络请求） */}
              {clientMeter && (
                <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--paper-light)', border: '1px dashed var(--border-c)' }}>
                  <div className="mb-1.5 flex items-center gap-1.5 font-ui text-[11px] font-medium" style={{ color: clientMeter.pass ? 'var(--sage)' : 'var(--sepia)' }}>
                    <Cpu className="h-3 w-3" /> 端侧格律校验（浏览器本地 · 中华新韵）
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-ui text-[11px] text-ink-mid">
                    <span>押韵 {clientMeter.rhymeOk ? '✓' : '✗'}</span>
                    <span>平仄 {clientMeter.pingzeOk ? '✓' : '✗'}</span>
                    {clientMeter.unknownChars.length > 0 && <span>未收录字 {clientMeter.unknownChars.join('')}</span>}
                  </div>
                  {clientMeter.lines.some((l) => l.issues.length > 0) && (
                    <ul className="mt-1.5 space-y-0.5 font-ui text-[11px] text-ink-soft">
                      {clientMeter.lines.flatMap((l, i) => l.issues.map((x) => <li key={`${i}-${x}`}>第{i + 1}句：{x}</li>))}
                    </ul>
                  )}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 font-ui text-xs text-ink-soft">
                <span className="inline-flex items-center gap-1.5">
                  {meta?.style ?? ''} · {meta?.form ?? '古诗词'}
                  {/* 格律后校验徽章：全过 ✓（sage 绿），未全过 ⚠（rose）并附 title 明细 */}
                  {doneInfo && meter && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-ui text-[11px]"
                      style={
                        meter.pass
                          ? { color: 'var(--sage)', border: '1px solid color-mix(in srgb, var(--sage) 45%, transparent)', background: 'color-mix(in srgb, var(--sage) 12%, transparent)' }
                          : { color: 'var(--rose)', border: '1px solid color-mix(in srgb, var(--rose) 45%, transparent)', background: 'color-mix(in srgb, var(--rose) 10%, transparent)' }
                      }
                      title={
                        meter.pass
                          ? '中华新韵格律校验通过：押韵与平仄合规（一三五不论 · 首句入韵宽容）'
                          : [
                              `格律校验（中华新韵）：押韵${meter.rhymeOk ? '✓' : '✗'} · 平仄${meter.pingzeOk ? '✓' : '✗'}`,
                              ...meter.lines.flatMap((issues, i) => issues.map((x) => `第${i + 1}句：${x}`)),
                            ].join('\n')
                      }
                    >
                      {meter.pass ? '✓ 格律校验' : '⚠ 格律存疑'}
                    </span>
                  )}
                  {/* 端侧格律校验：纯浏览器本地运行，无需网络请求 */}
                  {poem && !loading && (
                    <button
                      onClick={runClientMeter}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-ui text-[11px] transition-ink hover:bg-paper-dark"
                      style={{ color: 'var(--muted-blue)', border: '1px dashed var(--border-c)' }}
                      title="在浏览器端即时校验格律，无需网络请求"
                    >
                      <Cpu className="h-3 w-3" /> 端侧校验
                    </button>
                  )}
                </span>
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
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    onClick={speak}
                    className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                    title="朗读生成诗词"
                  >
                    {speech.speakingKey === 'transfer-poem' ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    {speech.speakingKey === 'transfer-poem' ? '停止' : '朗读'}
                  </button>
                  <span className="inline-flex items-center rounded-lg border-[1.5px] border-c px-1 py-1.5">
                    <SpeechSettingsPanel settings={speech.settings} voices={speech.voices} onChange={speech.updateSettings} />
                  </span>
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
                    onClick={exportScroll}
                    disabled={scrollExporting}
                    className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-60"
                    title="导出诗画长卷 PNG：竖排右起诗句 + 题签印章"
                  >
                    {scrollExporting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <ScrollText className="h-3.5 w-3.5" />}
                    诗画长卷
                  </button>
                  <button
                    onClick={exportMd}
                    className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                  >
                    <Download className="h-3.5 w-3.5" /> 导出 Markdown 报告
                  </button>
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
            footer={`${meta?.model || 'glm-4-flash'} · ${new Date().toLocaleDateString('zh-CN')}`}
          />
        </div>
      )}
      {/* 离屏诗画长卷 */}
      {doneInfo && poem && (
        <div ref={scrollRef} style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }} aria-hidden>
          <ScrollCard
            title={`${STYLES.find((s) => s.key === style)?.name || '古风'}新作`}
            subtitle="诗画长卷 · AI 风格迁移"
            poemLines={poem.split('\n')}
            note={text.length > 90 ? `${text.slice(0, 90)}…` : text}
            footer={`${meta?.model || 'glm-4-flash'} · ${new Date().toLocaleDateString('zh-CN')}`}
          />
        </div>
      )}
      <Toast msg={msg} />
    </div>
  );
}
