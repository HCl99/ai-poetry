'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { EMOTION_OPTIONS, VOICE_PRESETS, type EmotionKey } from '@/lib/voice-presets';

/** 朗读设置弹窗（配合 useSpeech hook 使用）：朗读风格 / 语速 / 降级音色 */
export function SpeechSettingsPanel({ settings, voices, onChange }: {
  settings: { rate: number; voiceURI: string | null; emotion: EmotionKey };
  voices: SpeechSynthesisVoice[];
  onChange: (patch: { rate?: number; voiceURI?: string | null; emotion?: EmotionKey }) => void;
}) {
  const [open, setOpen] = useState(false);
  const curVoice = voices.find((v) => v.voiceURI === settings.voiceURI);
  const preset = settings.emotion === 'auto' ? null : VOICE_PRESETS[settings.emotion];

  // Esc 关闭弹窗
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-ui text-xs text-ink-soft transition-ink hover:bg-white/70 hover:text-ink-deep"
        title="朗读设置：风格、语速与音色"
        aria-label="朗读设置"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-label="朗读设置"
        >
          <div
            className="w-full max-w-xs rounded-xl p-4"
            style={{ background: 'var(--paper-light)', boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-ui text-sm font-medium text-ink-deep">朗读设置</span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-0.5 font-ui text-xs text-ink-soft transition-ink hover:bg-paper-dark hover:text-ink-deep"
                aria-label="关闭朗读设置"
              >
                ✕
              </button>
            </div>

            <label className="mb-1 block font-ui text-xs text-ink-mid">朗读风格</label>
            <select
              value={settings.emotion}
              onChange={(e) => onChange({ emotion: e.target.value as EmotionKey })}
              className="h-8 w-full rounded-lg border-[1.5px] border-c bg-white/70 px-2 font-ui text-xs outline-none transition-ink focus:border-ink-deep"
            >
              {EMOTION_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 font-ui text-[10px] text-ink-soft">
              {preset ? preset.desc : '按诗题/诗人自动匹配音色与语气'}
            </p>

            <label className="mb-1 mt-3 flex items-center justify-between font-ui text-xs text-ink-mid">
              <span>语速</span>
              <span className="text-ink-soft">{settings.rate.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={settings.rate}
              onChange={(e) => onChange({ rate: Number(e.target.value) })}
              className="w-full accent-[#6B8E7B]"
            />

            <label className="mb-1 mt-3 block font-ui text-xs text-ink-mid">降级音色（合成服务不可用时）</label>
            <select
              value={settings.voiceURI || ''}
              onChange={(e) => onChange({ voiceURI: e.target.value || null })}
              className="h-8 w-full rounded-lg border-[1.5px] border-c bg-white/70 px-2 font-ui text-xs outline-none transition-ink focus:border-ink-deep"
            >
              <option value="">系统默认</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}（{v.lang}）
                </option>
              ))}
            </select>
            {curVoice && <p className="mt-1.5 truncate font-ui text-[10px] text-ink-soft">当前：{curVoice.name}</p>}
            <p className="mt-1 font-ui text-[10px] text-ink-soft">设置自动保存，全局生效</p>
          </div>
        </div>
      )}
    </span>
  );
}
