'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, CheckCircle2, Eye, Flag, GraduationCap, Loader2, RefreshCw, Route, Sparkles } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';

type Mode = 'mask' | 'first';
type Source = 'daily' | 'fav' | 'random';
type Phase = 'setup' | 'play' | 'done';

interface RecitePoem { id: string; title: string; author: string; dynasty: string; lines: string[] }

const CJK = /[\u4e00-\u9fff]/;

const MODES: { key: Mode; name: string; hint: string }[] = [
  { key: 'mask', name: '遮蔽填空', hint: '每句遮蔽一半字，补全空缺' },
  { key: 'first', name: '首字提示', hint: '只给每句首字，默写全句' },
];
const SOURCES: { key: Source; name: string; hint: string }[] = [
  { key: 'daily', name: '每日一诗', hint: '今日全站同一首' },
  { key: 'fav', name: '我的收藏', hint: '从收藏中抽背' },
  { key: 'random', name: '随机经典', hint: '全库随机一首' },
];

/** 计算每句被遮蔽的汉字下标（汉字序列中的位置） */
function hiddenIndices(line: string, mode: Mode): Set<number> {
  const cjkCount = [...line].filter((ch) => CJK.test(ch)).length;
  const set = new Set<number>();
  if (mode === 'first') {
    for (let i = 1; i < cjkCount; i++) set.add(i);
  } else {
    // 遮蔽约一半（隔字遮蔽，首字保留）
    for (let i = 1; i < cjkCount; i += 2) set.add(i);
  }
  return set;
}

export function ReciteView() {
  const [mode, setMode] = useState<Mode>('mask');
  const [source, setSource] = useState<Source>('daily');
  const [phase, setPhase] = useState<Phase>('setup');
  const [poem, setPoem] = useState<RecitePoem | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [lineOk, setLineOk] = useState<boolean[]>([]);
  const [cellOk, setCellOk] = useState<Record<string, boolean>>({});
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [judging, setJudging] = useState(false);
  const [readCount, setReadCount] = useState<number | null>(null);
  const { msg, show } = useToast();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  /** 拉取一首闯关诗并初始化填空状态 */
  async function loadPoem(src: Source) {
    if (loading) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/recite/poem?source=${src}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '取诗失败');
      if ((d.lines || []).length < 2) throw new Error('诗篇句数不足，换一首试试');
      setPoem(d);
      setAnswers({});
      setCellOk({});
      setLineOk([]);
      setReveal(false);
      setReadCount(null);
      inputRefs.current = [];
      setPhase('play');
    } catch (e: any) {
      show(e?.message || '取诗失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  function setCell(key: string, ch: string, nextIdx: number) {
    setAnswers((a) => ({ ...a, [key]: ch.slice(-1) }));
    if (ch) inputRefs.current[nextIdx]?.focus();
  }

  /** 交卷：逐句判分，错句红标，成绩写入学习路径 */
  async function judge(p: RecitePoem) {
    if (judging) return;
    setJudging(true);
    const cell: Record<string, boolean> = {};
    const lines: boolean[] = [];
    p.lines.forEach((line, li) => {
      const hidden = hiddenIndices(line, mode);
      let ci = -1;
      let ok = true;
      for (const ch of line) {
        if (!CJK.test(ch)) continue;
        ci++;
        if (!hidden.has(ci)) continue;
        const good = (answers[`${li}:${ci}`] || '') === ch;
        cell[`${li}:${ci}`] = good;
        if (!good) ok = false;
      }
      lines.push(ok);
    });
    setCellOk(cell);
    setLineOk(lines);
    const correct = lines.filter(Boolean).length;
    setPhase('done');
    try {
      const r = await fetch('/api/recite/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poemId: p.id, title: p.title, mode, total: p.lines.length, correct }),
      });
      const d = await r.json();
      if (r.ok) setReadCount(d.readCount);
    } catch { /* 成绩入库失败不影响判分展示 */ }
    setJudging(false);
  }

  const correctCount = lineOk.filter(Boolean).length;
  const grade = !poem ? '' :
    correctCount === poem.lines.length ? '过目成诵' :
    correctCount / poem.lines.length >= 0.75 ? '熟读成诵' :
    correctCount / poem.lines.length >= 0.5 ? '渐入佳境' : '再接再厉';

  // 输入框全局序号（渲染期递增，用于自动跳格）
  let inputSeq = 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">背诵闯关</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          逐句遮蔽填空、首字提示默写，交卷即判分，错句红标——成绩自动计入学习路径「启蒙诵读」进度
        </p>
      </div>

      {phase === 'setup' && (
        <div className="paper-card p-6">
          <h2 className="mb-4 font-ui text-[15px] font-medium text-ink-deep">选择闯关模式</h2>
          <div className="flex flex-wrap gap-2.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className="rounded-full border-[1.5px] px-4 py-2 font-ui text-sm transition-ink"
                style={mode === m.key
                  ? { background: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' }
                  : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
                title={m.hint}
              >
                {m.name}
              </button>
            ))}
          </div>
          <p className="mt-2.5 font-ui text-xs text-ink-soft">{MODES.find((m) => m.key === mode)?.hint}</p>

          <h2 className="mb-3 mt-6 font-ui text-[15px] font-medium text-ink-deep">诗篇来源</h2>
          <div className="flex flex-wrap gap-2.5">
            {SOURCES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSource(s.key)}
                className="rounded-full border-[1.5px] px-4 py-2 font-ui text-sm transition-ink"
                style={source === s.key
                  ? { background: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' }
                  : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
                title={s.hint}
              >
                {s.name}
              </button>
            ))}
          </div>
          <p className="mt-2.5 font-ui text-xs text-ink-soft">{SOURCES.find((s) => s.key === source)?.hint}</p>

          <button
            onClick={() => loadPoem(source)}
            disabled={loading}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:opacity-60"
            style={{ background: 'var(--btn-grad)' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
            {loading ? '正在抽题…' : '开始闯关'}
          </button>
        </div>
      )}

      {phase !== 'setup' && poem && (
        <div className="paper-card p-6">
          {/* 诗题头部 */}
          <div className="mb-5 text-center">
            <p className="font-brush text-2xl text-ink-deep">《{poem.title}》</p>
            <p className="mt-1 font-ui text-xs text-ink-soft">
              〔{poem.dynasty}〕{poem.author} · {MODES.find((m) => m.key === mode)?.name} · 共 {poem.lines.length} 句
            </p>
          </div>

          {/* 逐句填空区 */}
          <div className="space-y-3">
            {poem.lines.map((line, li) => {
              const hidden = hiddenIndices(line, mode);
              let ci = -1;
              const judged = phase === 'done';
              const bad = judged && !lineOk[li];
              const good = judged && lineOk[li];
              return (
                <div
                  key={li}
                  className="flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg px-4 py-3 transition-ink"
                  style={{
                    background: bad ? 'rgba(166,124,124,0.08)' : good ? 'rgba(107,142,123,0.08)' : 'var(--inset)',
                    borderLeft: `3px solid ${bad ? '#A67C7C' : good ? '#6B8E7B' : 'transparent'}`,
                  }}
                >
                  {[...line].map((ch, i) => {
                    if (!CJK.test(ch)) return <span key={i} className="font-serif text-lg text-ink-soft">{ch}</span>;
                    ci++;
                    const myCi = ci;
                    if (!hidden.has(myCi)) {
                      return (
                        <span key={i} className="font-serif text-lg" style={{ color: '#8B7355' }}>
                          {ch}
                        </span>
                      );
                    }
                    const key = `${li}:${myCi}`;
                    const idx = inputSeq++;
                    const showAnswer = reveal || (judged && cellOk[key] === false);
                    return (
                      <span key={i} className="relative inline-block">
                        <input
                          ref={(el) => { inputRefs.current[idx] = el; }}
                          value={showAnswer ? ch : answers[key] || ''}
                          readOnly={judged}
                          maxLength={1}
                          onChange={(e) => setCell(key, e.target.value, idx + 1)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing && phase === 'play') judge(poem);
                          }}
                          className="h-8 w-8 rounded-md border-[1.5px] text-center font-serif text-base outline-none transition-ink"
                          style={{
                            borderColor: judged ? (cellOk[key] ? '#6B8E7B' : '#A67C7C') : 'var(--border-c)',
                            background: judged
                              ? cellOk[key] ? 'rgba(107,142,123,0.12)' : 'rgba(166,124,124,0.14)'
                              : 'rgba(255,255,255,0.75)',
                            color: judged && !cellOk[key] ? '#A67C7C' : 'var(--ink-deep)',
                          }}
                          aria-label={`第${li + 1}句第${myCi + 1}字`}
                        />
                      </span>
                    );
                  })}
                  {judged && (
                    <span className="ml-auto flex items-center gap-1 font-ui text-xs" style={{ color: bad ? '#A67C7C' : '#6B8E7B' }}>
                      {good ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                      {good ? '背对了' : `应为：${line}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 操作区 */}
          {phase === 'play' ? (
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => judge(poem)}
                disabled={judging}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:opacity-60"
                style={{ background: 'var(--btn-grad)' }}
              >
                {judging ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
                交卷判分（Enter）
              </button>
              <button
                onClick={() => setPhase('setup')}
                className="rounded-lg border-[1.5px] border-c px-4 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark"
              >
                换模式
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4 anim-fade-up">
              {/* 成绩卡 */}
              <div className="flex flex-col items-center rounded-lg py-5" style={{ background: 'var(--inset)' }}>
                <p className="font-brush text-3xl text-ink-deep">{grade}</p>
                <p className="mt-1.5 font-ui text-sm text-ink-soft">
                  答对 {correctCount} / {poem.lines.length} 句
                  {readCount !== null && ` · 研习诗词进度 ${Math.min(readCount, 10)}/10 已同步学习路径`}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2.5">
                <button
                  onClick={() => setReveal((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-4 py-2 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                >
                  <Eye className="h-3.5 w-3.5" /> {reveal ? '隐藏答案' : '查看答案'}
                </button>
                <button
                  onClick={() => loadPoem('random')}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-4 py-2 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  再来一首
                </button>
                <Link
                  href={`/workbench/annotate?poem=${poem.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-4 py-2 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                >
                  <Sparkles className="h-3.5 w-3.5" /> AI 精读这首
                </Link>
                <Link
                  href="/workbench"
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-ui text-xs font-medium text-white transition-ink hover:-translate-y-0.5"
                  style={{ background: 'var(--btn-bg)' }}
                >
                  <Route className="h-3.5 w-3.5" /> 查看学习路径
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 玩法说明 */}
      {phase === 'setup' && (
        <div className="paper-card p-6">
          <h2 className="mb-3 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
            <BookOpen className="h-4 w-4 text-muted-blue" /> 玩法说明
          </h2>
          <ul className="space-y-2 font-ui text-sm leading-relaxed text-ink-mid">
            <li>· 遮蔽填空：每句隔字遮蔽，补全空格即可，适合入门诵读</li>
            <li>· 首字提示：只保留每句首字，默写整句，挑战真背诵</li>
            <li>· 交卷后错句整句红标并给出原句，答对句计入学习路径「启蒙诵读」进度</li>
            <li>· 成绩写入学习记录，工作台进度条实时更新</li>
          </ul>
        </div>
      )}
      <Toast msg={msg} />
    </div>
  );
}
