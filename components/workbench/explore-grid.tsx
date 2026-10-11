'use client';

import { useState } from 'react';
import { useToast, Toast } from '@/components/toast';

const DYNASTY_CLASS: Record<string, string> = {
  先秦: 'dynasty-song',
  汉魏: 'dynasty-tang',
  五代: 'dynasty-yuan',
  唐: 'dynasty-tang',
  宋: 'dynasty-song',
  元: 'dynasty-yuan',
  明清: 'dynasty-mingqing',
  清: 'dynasty-mingqing',
};

const DYNASTY_LABEL: Record<string, string> = {
  先秦: '先秦',
  汉魏: '汉魏',
  五代: '五代',
  唐: '唐诗',
  宋: '宋代',
  元: '元曲',
  明清: '明清',
  清: '清词',
};

export interface PoemCard {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  lines: string[];
  tags: string[];
}

function tabHref(q: string, dynasty: string) {
  return `/workbench/explore?q=${encodeURIComponent(q)}&dynasty=${encodeURIComponent(dynasty)}&page=1`;
}

export function ExploreGrid({
  poems,
  initialDynasty,
  q,
  dynastyCounts,
}: {
  poems: PoemCard[];
  initialDynasty: string;
  q: string;
  dynastyCounts: Record<string, number>;
}) {
  const [keyword, setKeyword] = useState(q);
  const { msg, show } = useToast();

  const tabs = ['全部', ...Object.keys(DYNASTY_LABEL).filter((d) => (dynastyCounts[d] || 0) > 0)];

  return (
    <>
      {/* 筛选 + 搜索 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2.5 font-ui">
          {tabs.map((d) => {
            const active = initialDynasty === d;
            const count = d === '全部' ? Object.values(dynastyCounts).reduce((a, b) => a + b, 0) : dynastyCounts[d] || 0;
            return (
              <a
                key={d}
                href={tabHref(q, d)}
                className="rounded-full border-[1.5px] px-4 py-1.5 text-sm transition-ink"
                style={
                  active
                    ? { background: '#3A3835', color: '#FAF8F3', borderColor: '#3A3835' }
                    : { borderColor: '#D4CFC5', color: '#5D5853' }
                }
              >
                {d === '全部' ? '全部' : DYNASTY_LABEL[d]}
                <span className="ml-1.5 opacity-60">{count >= 10000 ? `${Math.round(count / 1000) / 10}万` : count}</span>
              </a>
            );
          })}
        </div>
        <form action="/workbench/explore" className="flex gap-2">
          <input
            name="q"
            defaultValue={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索诗题、作者…"
            className="h-9 w-full rounded-full border border-c bg-white/70 px-4 font-ui text-sm outline-none transition-ink focus:border-ink-mid md:w-64"
          />
          <button type="submit" className="h-9 shrink-0 rounded-full px-5 font-ui text-sm text-white transition-ink" style={{ background: '#3A3835' }}>
            搜索
          </button>
        </form>
      </div>

      {/* 卡片网格 */}
      {poems.length === 0 ? (
        <div className="paper-card py-16 text-center">
          <p className="font-ui text-sm text-ink-soft">未找到匹配的诗词，换个关键词试试</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {poems.map((p) => (
            <div
              key={p.id}
              onClick={() => show(`《${p.title}》${p.author}`)}
              className="paper-card paper-card-hover relative cursor-pointer overflow-hidden px-6 py-6"
            >
              <span className="absolute top-0 left-0 h-0.5 w-full opacity-0 transition-ink" style={{ background: 'linear-gradient(90deg,#7B8EA1,#8B7355)' }} />
              <div className="flex items-start justify-between">
                <h3 className="line-clamp-1 font-brush text-xl text-ink-deep">{p.title}</h3>
                <span className={`dynasty-tag shrink-0 ${DYNASTY_CLASS[p.dynasty] || 'dynasty-tang'}`}>{p.dynasty}</span>
              </div>
              <p className="mt-0.5 font-ui text-xs text-ink-soft">{p.author}</p>
              <div className="my-3 ink-divider" />
              <div className="space-y-0.5 text-center font-serif text-[15px] leading-[2.1] text-ink-mid">
                {p.lines.map((l, i) => <p key={i}>{l}</p>)}
              </div>
              {p.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {p.tags.map((t) => (
                    <span key={t} className="rounded-full bg-paper-dark px-2.5 py-0.5 font-ui text-xs text-ink-soft">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Toast msg={msg} />
    </>
  );
}
