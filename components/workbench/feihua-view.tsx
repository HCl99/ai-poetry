'use client';

import { useRef, useState } from 'react';
import { Swords, RotateCcw, Flag, CheckCheck, Sparkles, Lightbulb } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';

const PRESET_CHARS = ['花', '月', '春', '风', '雪', '山', '水', '云', '夜', '酒'];

const MAX_HINTS = 3;

interface Source { title: string; author: string; dynasty: string }
interface Move { side: 'user' | 'ai'; text: string; source?: Source; judged?: boolean }

const strip = (s: string) => s.replace(/[，。？！、；：''""\s《》·\-—]/g, '');

export function FeihuaView() {
  const [char, setChar] = useState('');
  const [custom, setCustom] = useState('');
  const [moves, setMoves] = useState<Move[]>([]);
  const [playing, setPlaying] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [over, setOver] = useState<null | 'win' | 'lose'>(null);
  const [hintsLeft, setHintsLeft] = useState(MAX_HINTS);
  const [hintLoading, setHintLoading] = useState(false);
  const { msg, show } = useToast();
  const listRef = useRef<HTMLDivElement>(null);

  function start(c: string) {
    if (!/^[\u4e00-\u9fa5]$/.test(c)) { show('令字必须是单个汉字'); return; }
    setChar(c);
    setMoves([]);
    setOver(null);
    setPlaying(true);
    setHintsLeft(MAX_HINTS);
    setInput('');
    show(`飞花令开始 · 令字「${c}」，请你先出句`);
  }

  /** 出句前本地预检：乱码/重复即时反馈，不打扰后端 */
  function localCheck(line: string): string | null {
    const norm = strip(line);
    const hanCount = (norm.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (hanCount < 2) return '请输入中文诗句（至少含两个汉字）';
    if (norm.length > 40) return '单句过长（40 字以内）';
    if (!norm.includes(char)) return `诗句中需要包含令字「${char}」`;
    const used = moves.filter((m) => m.side === 'user').map((m) => strip(m.text));
    if (used.includes(norm)) return '这句已经有人说过了，换一句';
    return null;
  }

  async function submit() {
    const line = input.trim();
    if (!line || thinking || over) return;
    const localErr = localCheck(line);
    if (localErr) { show(localErr); return; }
    setInput('');
    setThinking(true);
    try {
      const r = await fetch('/api/feihua', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ char, played: moves.filter((m) => m.side === 'user').map((m) => m.text), playerLine: line }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '请求失败');
      if (!d.valid) { show(d.reason || '此句不被接受'); return; }

      const next: Move[] = [...moves, { side: 'user' as const, text: line, source: d.source, judged: d.judged }];
      if (d.aiLine) {
        next.push({ side: 'ai' as const, text: d.aiLine.text, source: d.aiLine.source });
        setMoves(next);
      } else {
        setMoves(next);
        setOver('win');
      }
    } catch (e: any) {
      show(e?.message || '网络异常，请重试');
    } finally {
      setThinking(false);
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 60);
    }
  }

  /** 求提示：从全库取一句未使用过的含令字诗句，填入输入框供参考 */
  async function askHint() {
    if (hintsLeft <= 0 || hintLoading || thinking || over) return;
    setHintLoading(true);
    try {
      const r = await fetch('/api/feihua/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ char, played: moves.filter((m) => m.side === 'user').map((m) => m.text) }),
      });
      const d = await r.json();
      if (!r.ok) { show(d.error || '获取提示失败'); return; }
      if (d.exhausted) { show('诗库中已找不到未用过的新句，试试认输或换字'); setHintsLeft(0); return; }
      if (d.hint?.text) {
        setInput(d.hint.text);
        show(`提示出处：〔${d.hint.source.dynasty}〕${d.hint.source.author}《${d.hint.source.title}》`);
      }
      setHintsLeft((v) => Math.max(0, v - 1));
    } catch {
      show('网络异常，请重试');
    } finally {
      setHintLoading(false);
    }
  }

  if (!playing) {
    /* ---- 开局：选令字 ---- */
    return (
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 font-brush text-3xl text-ink-black">
            <Swords className="h-7 w-7 text-rose-c" /> 飞花令
          </h1>
          <p className="mt-1.5 font-ui text-sm text-ink-soft">
            与 AI 轮流吟出含令字的诗句 · AI 每一句都出自全库真实诗文并可溯源 · 库中未收录的名句由 GLM 审校判定
          </p>
        </div>

        <div className="paper-card mx-auto max-w-xl p-8 text-center">
          <p className="font-ui text-sm text-ink-mid">选择令字，或自定一个汉字</p>
          <div className="mt-5 grid grid-cols-5 gap-3">
            {PRESET_CHARS.map((c) => (
              <button
                key={c}
                onClick={() => start(c)}
                className="rounded-xl py-4 font-brush text-3xl text-ink-deep transition-ink hover:-translate-y-1"
                style={{ background: 'var(--inset)', border: '1px solid var(--border-light)' }}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="mt-6 flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) start(custom.trim()); }}
              maxLength={1}
              placeholder="自定令字（单个汉字）"
              className="h-11 min-w-0 flex-1 rounded-lg border-[1.5px] border-c bg-white/70 px-3 text-center font-brush text-xl outline-none transition-ink focus:border-ink-deep"
            />
            <button
              onClick={() => start(custom.trim())}
              className="h-11 shrink-0 rounded-lg px-6 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5"
              style={{ background: 'var(--btn-grad)', color: '#fff' }}
            >
              开始对战
            </button>
          </div>
        </div>

        <div className="paper-card mx-auto max-w-xl p-6">
          <h2 className="mb-3 font-ui text-[15px] font-medium text-ink-deep">规则</h2>
          <ol className="list-inside list-decimal space-y-1.5 font-ui text-sm text-ink-mid">
            <li>双方轮流吟出包含令字的诗句，每人每次一句</li>
            <li>诗句必须真实存在：全库可查的名句直接溯源出典</li>
            <li>全库未收录的名句由 GLM 审校判定真伪，判定结果会标注</li>
            <li>句子不可重复，接不上的一方落败</li>
            <li>卡住时可「求提示」，每局限 3 次，用完按钮置灰</li>
          </ol>
        </div>
        <Toast msg={msg} />
      </div>
    );
  }

  /* ---- 对战进行中 ---- */
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-xl font-brush text-4xl text-white shadow-ink" style={{ background: 'var(--btn-grad)' }}>{char}</span>
          <div>
            <h1 className="font-brush text-2xl text-ink-black">飞花令 · 「{char}」</h1>
            <p className="mt-0.5 font-ui text-xs text-ink-soft">已过 {Math.ceil(moves.length / 2)} 回合 · 你 {moves.filter((m) => m.side === 'user').length} 句 / AI {moves.filter((m) => m.side === 'ai').length} 句</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!over && (
            <button onClick={() => { setOver('lose'); }} className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3.5 py-2 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark">
              <Flag className="h-3.5 w-3.5" /> 认输
            </button>
          )}
          <button onClick={() => { setPlaying(false); setChar(''); }} className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-c px-3.5 py-2 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark">
            <RotateCcw className="h-3.5 w-3.5" /> 重新开始
          </button>
        </div>
      </div>

      <div className="paper-card p-6">
        {/* 战局 */}
        <div ref={listRef} className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
          {moves.length === 0 && (
            <p className="py-10 text-center font-ui text-sm text-ink-soft">请吟出一句含「{char}」的诗句开始对战</p>
          )}
          {moves.map((m, i) => (
            <div key={i} className={`flex ${m.side === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${m.side === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 font-serif text-[15px] leading-relaxed ${m.side === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                  style={m.side === 'user'
                    ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' }
                    : { background: 'var(--paper-light)', border: '1px solid var(--border-light)', color: 'var(--ink-deep)' }}
                >
                  {m.text}
                </div>
                <div className={`mt-1 flex items-center gap-2 font-ui text-[11px] text-ink-soft ${m.side === 'user' ? 'justify-end' : ''}`}>
                  {m.judged && <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5" style={{ background: 'rgba(196,169,101,0.18)', color: '#8B7355' }}><CheckCheck className="h-3 w-3" /> GLM 审校通过</span>}
                  {m.source && <span>〔{m.source.dynasty}〕{m.source.author}《{m.source.title}》</span>}
                </div>
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm px-4 py-2.5" style={{ background: 'var(--paper-light)', border: '1px solid var(--border-light)' }}>
                <span className="inline-flex items-center gap-2 font-ui text-xs text-ink-soft">
                  <Sparkles className="h-3.5 w-3.5 text-muted-blue" /> AI 正在翻阅全库找句子…
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 胜负横幅 */}
        {over && (
          <div
            className="anim-fade-up mt-5 rounded-lg p-5 text-center"
            style={over === 'win'
              ? { background: 'rgba(107,142,123,0.12)', border: '1px solid rgba(107,142,123,0.4)' }
              : { background: 'rgba(166,124,124,0.10)', border: '1px solid rgba(166,124,124,0.4)' }}
          >
            <p className="font-brush text-2xl" style={{ color: over === 'win' ? '#4E6E5D' : '#A67C7C' }}>
              {over === 'win' ? 'AI 无句可应，你赢了！' : '你已认输，再战一局？'}
            </p>
            <p className="mt-1 font-ui text-xs text-ink-soft">
              {over === 'win' ? `「${char}」字令，你共对出 ${moves.filter((m) => m.side === 'user').length} 句，战绩已记入学习历史` : '胜败乃兵家常事'}
            </p>
            <button onClick={() => { setPlaying(false); setChar(''); }} className="mt-4 rounded-lg px-6 py-2.5 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5" style={{ background: 'var(--btn-grad)', color: '#fff' }}>
              再来一局
            </button>
          </div>
        )}

        {/* 输入 */}
        {!over && (
          <div className="mt-5 space-y-2">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) submit(); }}
                disabled={thinking}
                placeholder={`吟一句含「${char}」的诗句…（Enter 出句）`}
                className="h-11 min-w-0 flex-1 rounded-lg border-[1.5px] border-c bg-white/70 px-3.5 font-serif text-sm outline-none transition-ink focus:border-ink-deep disabled:opacity-60"
              />
              <button
                onClick={submit}
                disabled={thinking || !input.trim()}
                className="h-11 shrink-0 rounded-lg px-6 font-ui text-sm font-medium transition-ink hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                style={{ background: 'var(--btn-grad)', color: '#fff' }}
              >
                {thinking ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '出句'}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={askHint}
                disabled={hintsLeft <= 0 || hintLoading || thinking}
                title={hintsLeft <= 0 ? '本局提示已用完' : '从诗库取一句未用过的含令字诗句'}
                className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 font-ui text-xs transition-ink disabled:cursor-not-allowed disabled:opacity-40"
                style={hintsLeft <= 0 ? { borderColor: 'var(--border-c)', color: 'var(--ink-soft)', background: 'var(--inset)' } : { borderColor: 'rgba(196,169,101,0.5)', color: '#8B7355' }}
              >
                <Lightbulb className="h-3.5 w-3.5" />
                {hintLoading ? '翻找诗库…' : '求提示'}
              </button>
              <span className={`font-ui text-xs ${hintsLeft <= 0 ? 'text-ink-soft/60' : 'text-ink-soft'}`}>
                {hintsLeft > 0 ? `本局剩余提示 ${hintsLeft}/${MAX_HINTS}` : '提示已耗尽'}
              </span>
            </div>
          </div>
        )}
      </div>
      <Toast msg={msg} />
    </div>
  );
}
