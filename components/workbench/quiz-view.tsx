'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpenCheck, CheckCircle2, Loader2, PenLine, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';

interface QuizQuestion {
  id: string; type: 'choice' | 'blank' | 'appreciation'; difficulty: string;
  typeLabel: string; diffLabel: string;
  question: string; options?: string[];
  poem?: { id: string; title: string; author: string; dynasty: string; excerpt: string[] } | null;
  hint: string;
}
interface QuizResult { score: number; answer: string; feedback: string }
interface RecordItem { id: string; type: string; difficulty: string; question: string; score: number | null; feedback: string | null; createdAt: string }
interface Stats { total: number; avgScore: number | null; objectiveCorrect: number; objectiveTotal: number }

const TYPE_TABS = [
  { key: 'choice', label: '选择题', desc: '作者·诗句·诗题配对' },
  { key: 'blank', label: '填空题', desc: '字词·整句·连句补全' },
  { key: 'appreciation', label: '鉴赏题', desc: 'AI 阅卷评分点评' },
] as const;
const DIFFS = [
  { key: 'easy', label: '易' },
  { key: 'medium', label: '中' },
  { key: 'hard', label: '难' },
] as const;

export function QuizView() {
  const [type, setType] = useState<(typeof TYPE_TABS)[number]['key']>('choice');
  const [difficulty, setDifficulty] = useState<(typeof DIFFS)[number]['key']>('medium');
  const [quiz, setQuiz] = useState<QuizQuestion | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const { msg, show } = useToast();

  const loadRecords = useCallback(async () => {
    try {
      const r = await fetch('/api/quiz');
      if (!r.ok) return;
      const d = await r.json();
      setRecords(d.records || []);
      setStats(d.stats || null);
    } catch {}
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  async function generate() {
    if (loadingQuiz) return;
    setLoadingQuiz(true);
    setQuiz(null);
    setResult(null);
    setSelected(null);
    setAnswerText('');
    try {
      const r = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, difficulty }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '出题失败');
      setQuiz(d);
    } catch (e: unknown) {
      show((e as Error).message || '出题失败');
    } finally {
      setLoadingQuiz(false);
    }
  }

  async function submit(answer: string) {
    if (!quiz || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/quiz', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: quiz.id, userAnswer: answer }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '提交失败');
      setResult(d);
      loadRecords();
    } catch (e: unknown) {
      show((e as Error).message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">诗词测验</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          三种题型 × 三档难度，34 万诗库程序出题；鉴赏题由 AI 阅卷评分并给出点评
        </p>
      </div>

      {/* 题型与难度 */}
      <div className="paper-card p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className="rounded-xl border-[1.5px] p-4 text-left transition-ink"
              style={type === t.key
                ? { borderColor: 'var(--btn-bg)', background: 'rgba(107,142,123,0.08)' }
                : { borderColor: 'var(--border-c)' }}
            >
              <div className="flex items-center gap-2 font-ui text-sm font-medium text-ink-deep">
                {t.key === 'choice' ? <BookOpenCheck className="h-4 w-4 text-muted-blue" /> : t.key === 'blank' ? <PenLine className="h-4 w-4 text-muted-blue" /> : <Sparkles className="h-4 w-4 text-muted-blue" />}
                {t.label}
              </div>
              <div className="mt-1 font-ui text-xs text-ink-soft">{t.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="font-ui text-sm text-ink-deep">难度</span>
          {DIFFS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDifficulty(d.key)}
              className="rounded-full border-[1.5px] px-4 py-1.5 font-ui text-sm transition-ink"
              style={difficulty === d.key
                ? { background: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' }
                : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
            >
              {d.label}
            </button>
          ))}
          <button
            onClick={generate}
            disabled={loadingQuiz}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 disabled:opacity-50"
            style={{ background: 'var(--btn-grad)' }}
          >
            {loadingQuiz ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {quiz ? '换一题' : '开始答题'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* 答题卡 */}
        <div>
          {!quiz && !loadingQuiz && (
            <div className="paper-card p-10 text-center font-ui text-sm text-ink-soft">
              选择题型与难度，点击「开始答题」
            </div>
          )}
          {loadingQuiz && (
            <div className="paper-card flex items-center justify-center p-10 font-ui text-sm text-ink-soft">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在从诗库出题…
            </div>
          )}
          {quiz && (
            <div className="paper-card p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2.5 py-0.5 font-ui text-xs" style={{ background: 'rgba(107,142,123,0.15)', color: '#6B8E7B' }}>{quiz.typeLabel}</span>
                <span className="rounded-full px-2.5 py-0.5 font-ui text-xs" style={{ background: 'rgba(196,169,101,0.15)', color: '#C4A965' }}>难度 · {quiz.diffLabel}</span>
                {quiz.poem && (
                  <span className="font-ui text-xs text-ink-soft">
                    出自诗库 · <button className="hover:underline" onClick={() => window.open(`/workbench/explore?q=${encodeURIComponent(quiz.poem!.title)}`, '_self')}>《{quiz.poem.title}》{quiz.poem.author}</button>
                  </span>
                )}
              </div>

              {quiz.poem && quiz.poem.excerpt.length > 0 && (
                <div className="mt-4 rounded-xl p-4 font-serif text-base leading-loose text-ink-deep" style={{ background: 'var(--inset)', whiteSpace: 'pre-line' }}>
                  {quiz.poem.excerpt.join('\n')}
                </div>
              )}

              <p className="mt-4 whitespace-pre-line font-serif text-base font-medium leading-relaxed text-ink-deep">{quiz.question}</p>
              <p className="mt-1 font-ui text-xs text-ink-soft">提示：{quiz.hint}</p>

              {/* 选择题选项 */}
              {quiz.type === 'choice' && quiz.options && (
                <div className="mt-4 space-y-2">
                  {quiz.options.map((op) => {
                    const isAnswer = result && op === result.answer;
                    const isWrongPick = result && selected === op && op !== result.answer;
                    return (
                      <button
                        key={op}
                        disabled={!!result || submitting}
                        onClick={() => { setSelected(op); submit(op); }}
                        className="flex w-full items-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-left font-serif text-sm leading-relaxed text-ink-deep transition-ink disabled:cursor-default"
                        style={isAnswer
                          ? { borderColor: '#6B8E7B', background: 'rgba(107,142,123,0.12)' }
                          : isWrongPick
                            ? { borderColor: '#A67C7C', background: 'rgba(166,124,124,0.1)' }
                            : { borderColor: 'var(--border-c)' }}
                      >
                        {isAnswer ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#6B8E7B' }} />
                          : isWrongPick ? <XCircle className="h-4 w-4 shrink-0" style={{ color: '#A67C7C' }} />
                          : <span className="h-4 w-4 shrink-0" />}
                        {op}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 填空 / 鉴赏输入 */}
              {quiz.type !== 'choice' && (
                <div className="mt-4">
                  {quiz.type === 'blank' ? (
                    <input
                      className="h-11 w-full rounded-xl border border-c bg-white/70 px-4 font-serif text-base text-ink-deep outline-none transition-ink focus:border-ink-mid"
                      placeholder="填写答案，Enter 提交"
                      value={answerText}
                      disabled={!!result}
                      onChange={(e) => setAnswerText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && answerText.trim()) submit(answerText); }}
                    />
                  ) : (
                    <textarea
                      className="min-h-[120px] w-full rounded-xl border border-c bg-white/70 p-4 font-ui text-sm leading-relaxed text-ink-deep outline-none transition-ink focus:border-ink-mid"
                      placeholder="写下你的鉴赏（100-200 字），提交后 AI 阅卷评分…"
                      maxLength={600}
                      value={answerText}
                      disabled={!!result}
                      onChange={(e) => setAnswerText(e.target.value)}
                    />
                  )}
                  {!result && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => submit(answerText)}
                        disabled={!answerText.trim() || submitting}
                        className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 disabled:opacity-50"
                        style={{ background: 'var(--btn-grad)' }}
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {quiz.type === 'appreciation' ? '提交给 AI 阅卷' : '提交答案'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 判分结果 */}
              {result && (
                <div className="mt-5 rounded-xl p-5" style={{ background: 'var(--inset)' }}>
                  <div className="flex items-center gap-4">
                    <div className="font-brush text-5xl" style={{ color: result.score >= 80 ? '#6B8E7B' : result.score >= 60 ? '#C4A965' : '#A67C7C' }}>
                      {result.score}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-ui text-sm font-medium text-ink-deep">
                        {quiz.type === 'appreciation' ? 'AI 阅卷评分' : result.score === 100 ? '回答正确！' : '回答错误'}
                      </div>
                      <p className="mt-0.5 font-ui text-xs leading-relaxed text-ink-mid">{result.feedback}</p>
                      {quiz.type !== 'choice' && (
                        <p className="mt-1 font-ui text-xs text-ink-soft">参考答案：{result.answer}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={generate}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5"
                    style={{ background: 'var(--btn-grad)' }}
                  >
                    <RefreshCw className="h-4 w-4" /> 再来一题
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 学习记录 */}
        <aside className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '答题数', value: stats?.total ?? '-', c: '#7B8EA1' },
              { label: '平均分', value: stats?.avgScore ?? '-', c: '#6B8E7B' },
              { label: '客观正确', value: stats && stats.objectiveTotal ? `${stats.objectiveCorrect}/${stats.objectiveTotal}` : '-', c: '#C4A965' },
            ].map((s) => (
              <div key={s.label} className="paper-card p-3 text-center">
                <div className="font-brush text-2xl" style={{ color: s.c }}>{s.value}</div>
                <div className="mt-0.5 font-ui text-[10px] text-ink-soft">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="paper-card p-4">
            <h3 className="mb-3 font-ui text-[15px] font-medium text-ink-deep">最近答题记录</h3>
            {records.length === 0 ? (
              <p className="py-6 text-center font-ui text-xs text-ink-soft">还没有答题记录</p>
            ) : (
              <div className="space-y-2">
                {records.map((r) => (
                  <div key={r.id} className="rounded-lg p-3" style={{ background: 'var(--inset)' }}>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 font-ui text-[10px]" style={{ background: 'rgba(107,142,123,0.15)', color: '#6B8E7B' }}>
                        {r.type === 'choice' ? '选择' : r.type === 'blank' ? '填空' : '鉴赏'}·{r.difficulty === 'easy' ? '易' : r.difficulty === 'medium' ? '中' : '难'}
                      </span>
                      <span className="ml-auto font-brush text-lg" style={{ color: (r.score || 0) >= 80 ? '#6B8E7B' : (r.score || 0) >= 60 ? '#C4A965' : '#A67C7C' }}>
                        {r.score ?? '-'}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-ui text-xs text-ink-mid" title={r.question}>{r.question.replace(/\n/g, ' ')}</p>
                    <p className="mt-0.5 font-ui text-[10px] text-ink-soft">{new Date(r.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
