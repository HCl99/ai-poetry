'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORE_KEY = 'onboarding-done';

/** 新手三步引导：首次进入工作台展示，完成/跳过后持久化不再出现 */
const STEPS = [
  {
    title: '探索 34 万首诗词',
    desc: '左侧「诗词探索」按朝代、题材、意象检索全库；顶部搜索框可随时查诗题、作者。',
    href: '/workbench/explore',
    hrefLabel: '去逛逛',
  },
  {
    title: '让 AI 为诗做注',
    desc: '选一首诗，AI 基于 RAG 检索输出字词、典故、情感、格律四维注解，引用全部可溯源。',
    href: '/workbench/annotate',
    hrefLabel: '试试注解',
  },
  {
    title: '把现代文写成诗',
    desc: '「风格迁移」输入一段白话，生成李白、苏轼、杜甫等五种风格作品，还能配水墨意境图。',
    href: '/workbench/transfer',
    hrefLabel: '去创作',
  },
];

export function Onboarding() {
  const [step, setStep] = useState<number | null>(null);

  // 挂载后再读 localStorage，避免 SSR/客户端不一致
  useEffect(() => {
    if (!localStorage.getItem(STORE_KEY)) setStep(0);
  }, []);

  if (step === null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  function finish() {
    localStorage.setItem(STORE_KEY, '1');
    setStep(null);
  }

  return (
    <div
      className="fixed inset-0 z-[900] flex items-end justify-center bg-black/25 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="新手引导"
      onClick={finish}
      onKeyDown={(e) => { if (e.key === 'Escape') finish(); }}
    >
      <div
        className="anim-fade-up paper-card w-full max-w-[380px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-ui text-[11px] tracking-widest text-ink-soft">
            新手引导 · {step + 1} / {STEPS.length}
          </span>
          <button
            onClick={finish}
            className="font-ui text-xs text-ink-soft transition-ink hover:text-ink-mid"
            aria-label="跳过引导"
          >
            跳过
          </button>
        </div>

        {/* 步骤指示点 */}
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-ink"
              style={{
                width: i === step ? 20 : 8,
                background: i === step ? 'var(--btn-bg)' : 'var(--border-c)',
              }}
            />
          ))}
        </div>

        <h3 className="mt-4 font-brush text-2xl text-ink-deep">{s.title}</h3>
        <p className="mt-2 font-ui text-sm leading-relaxed text-ink-mid">{s.desc}</p>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Link
            href={s.href}
            onClick={finish}
            className="font-ui text-sm transition-ink hover:underline"
            style={{ color: 'var(--sage)' }}
          >
            {s.hrefLabel} →
          </Link>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="rounded-lg border border-c px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark"
              >
                上一步
              </button>
            )}
            <button
              onClick={() => (last ? finish() : setStep(step + 1))}
              className="rounded-lg px-4 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5"
              style={{ background: 'var(--btn-bg)' }}
              autoFocus
            >
              {last ? '开始探索' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
