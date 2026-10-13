'use client';

import { useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useSpeech } from '@/lib/use-speech';
import { SpeechSettingsPanel } from './speech-panel';

interface PoemMeta {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  lines: string[];
  tags: string[];
}

const DYNASTY_CLASS: Record<string, string> = {
  先秦: 'dynasty-song', 汉魏: 'dynasty-tang', 五代: 'dynasty-yuan',
  唐: 'dynasty-tang', 宋: 'dynasty-song', 元: 'dynasty-yuan',
  明清: 'dynasty-mingqing', 清: 'dynasty-mingqing',
};

export function PoemDetailView({ poem, bio, initial }: {
  poem: PoemMeta;
  bio: string | null;
  initial: { fanyi: string | null; shangxi: string | null; source: string | null };
}) {
  const [tab, setTab] = useState<'fanyi' | 'shangxi'>('fanyi');
  const [fanyi, setFanyi] = useState(initial.fanyi);
  const [shangxi, setShangxi] = useState(initial.shangxi);
  const [source, setSource] = useState(initial.source);
  const [loading, setLoading] = useState(false);
  const { msg, show } = useToast();
  const speech = useSpeech();

  /** 朗读诗文：先题名/朝代/作者，再逐句朗读，当前句高亮 */
  function toggleRead() {
    if (!speech.supported) { show('当前浏览器不支持语音合成'); return; }
    if (speech.speakingKey === 'detail-poem') { speech.stop(); return; }
    speech.speakLines('detail-poem', [`${poem.title}。${poem.dynasty}代，${poem.author}。`, ...poem.lines]);
  }

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch('/api/poem/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poemId: poem.id }),
      });
      const d = await r.json();
      if (!r.ok) { show(d.error || '生成失败'); return; }
      setFanyi(d.fanyi || null);
      setShangxi(d.shangxi || null);
      setSource(d.source || null);
      show(d.cached ? '已载入译文库' : 'AI 生成完成');
    } catch {
      show('网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }

  const hasContent = !!(fanyi || shangxi);

  return (
    <div className="paper-card relative overflow-hidden px-6 py-8 md:px-10">
      <span className="absolute top-0 left-0 h-0.5 w-full" style={{ background: 'linear-gradient(90deg,#7B8EA1,#8B7355)' }} />

      {/* 诗头 */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          <span className={`dynasty-tag ${DYNASTY_CLASS[poem.dynasty] || 'dynasty-tang'}`}>{poem.dynasty}</span>
          <h1 className="font-brush text-3xl text-ink-deep">{poem.title}</h1>
        </div>
        <p className="mt-2 font-ui text-sm text-ink-soft">{poem.author}</p>
        {bio && (
          <p className="mx-auto mt-3 max-w-[560px] line-clamp-2 font-ui text-xs leading-relaxed text-ink-soft" title={bio}>
            {bio}
          </p>
        )}
      </div>

      <div className="my-6 ink-divider" />

      {/* 朗读控制（卡片右上角）：逐句朗读当前句高亮 */}
      <div className="absolute right-5 top-5 flex items-center gap-1">
        <button
          onClick={toggleRead}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-ui text-xs text-ink-soft transition-ink hover:bg-white/70 hover:text-ink-deep"
          title="朗读诗文（当前句高亮）"
        >
          {speech.speakingKey === 'detail-poem' ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {speech.speakingKey === 'detail-poem' ? '停止' : '朗读'}
        </button>
        <SpeechSettingsPanel settings={speech.settings} voices={speech.voices} onChange={speech.updateSettings} />
      </div>

      {/* 诗文 */}
      <div className="space-y-1 text-center font-serif text-lg leading-[2.3] text-ink-deep">
        {poem.lines.map((l, i) => (
          <p key={i} style={speech.speakingKey === 'detail-poem' && speech.activeLine === i + 1 ? { background: 'rgba(107,142,123,0.15)', borderRadius: 4 } : undefined}>{l}</p>
        ))}
      </div>

      {poem.tags.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {poem.tags.map((t) => (
            <span key={t} className="rounded-full bg-paper-dark px-2.5 py-0.5 font-ui text-xs text-ink-soft">{t}</span>
          ))}
        </div>
      )}

      <div className="my-7 ink-divider" />

      {/* 译文 / 赏析 */}
      {hasContent ? (
        <>
          <div className="flex items-center justify-center gap-2">
            {(['fanyi', 'shangxi'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                disabled={!((t === 'fanyi' ? fanyi : shangxi))}
                className="rounded-full px-5 py-1.5 font-ui text-sm transition-ink disabled:cursor-not-allowed disabled:opacity-40"
                style={tab === t ? { background: 'var(--btn-bg)', color: 'var(--btn-text)' } : { background: 'var(--inset)', color: 'var(--ink-mid)' }}
              >
                {t === 'fanyi' ? '译文' : '赏析'}
              </button>
            ))}
          </div>
          <div className="mx-auto mt-5 max-w-[620px] rounded-lg px-6 py-5" style={{ background: 'var(--inset)' }}>
            <p className="whitespace-pre-line font-serif text-[15px] leading-[2] text-ink-mid">
              {(tab === 'fanyi' ? fanyi : shangxi) || '暂无内容'}
            </p>
            {source && (
              <p className="mt-3 text-right font-ui text-[11px] text-ink-soft">来源：{source}</p>
            )}
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-[620px] rounded-lg px-6 py-8 text-center" style={{ background: 'var(--inset)' }}>
          <p className="font-ui text-sm text-ink-mid">这首诗还没有译文与赏析</p>
          <button
            onClick={generate}
            disabled={loading}
            className="mt-4 rounded-lg px-6 py-2.5 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
          >
            {loading ? 'AI 正在研读这首诗…' : 'AI 生成译文与赏析'}
          </button>
          {loading && <p className="mt-3 font-ui text-xs text-ink-soft">检索相似诗篇与诗人小传后由 GLM 撰写，约需 5-10 秒</p>}
        </div>
      )}

      {/* 关联功能入口 */}
      <div className="mt-6 flex justify-center">
        <a
          href={`/workbench/annotate?poem=${poem.id}`}
          className="inline-flex items-center gap-1.5 font-ui text-sm transition-ink hover:opacity-80"
          style={{ color: '#6B8E7B' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" /></svg>
          深度解读：AI 智能注解
        </a>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
