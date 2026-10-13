'use client';

import { useState } from 'react';
import { Settings2 } from 'lucide-react';

/** 语速/音色设置弹层（配合 useSpeech hook 使用） */
export function SpeechSettingsPanel({ settings, voices, onChange }: {
  settings: { rate: number; voiceURI: string | null };
  voices: SpeechSynthesisVoice[];
  onChange: (patch: { rate?: number; voiceURI?: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const curVoice = voices.find((v) => v.voiceURI === settings.voiceURI);

  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-ui text-xs text-ink-soft transition-ink hover:bg-white/70 hover:text-ink-deep"
        title="朗读设置：语速与音色"
        aria-label="朗读设置"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-30 w-60 rounded-lg border border-light bg-paper-light p-3 shadow-ink"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="mb-1 flex items-center justify-between font-ui text-xs text-ink-mid">
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
          <label className="mb-1 mt-3 block font-ui text-xs text-ink-mid">音色</label>
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
      )}
    </span>
  );
}
