'use client';

import { useVoiceInput } from '@/lib/use-voice-input';

/**
 * 语音输入按钮（麦克风）：录音 → 本地识别 → 结果回填宿主输入框，识别中显示脉冲提示。
 * 不支持时返回 null，不占位、不干扰布局；失败通过 onError 回调与 title / aria-live 提示。
 */
export function VoiceInputButton({
  onText,
  onError,
  size = 'md',
  className = '',
}: {
  onText: (text: string) => void;
  onError?: (msg: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const v = useVoiceInput(onText, onError);
  if (!v.supported) return null;

  const box = size === 'sm' ? 'h-9 w-9' : 'h-[42px] w-[42px]';
  const busy = v.listening || v.transcribing;
  const label = v.listening ? '正在录音，点击结束' : v.transcribing ? '正在识别语音…' : '语音输入';

  return (
    <>
      <button
        type="button"
        onClick={v.start}
        disabled={v.transcribing}
        aria-label={label}
        aria-pressed={busy}
        title={v.error ?? label}
        className={`${box} flex shrink-0 items-center justify-center rounded-xl border transition-ink ${busy ? 'anim-pulse-ring border-rose-c text-rose-c' : 'border-c text-ink-soft hover:border-ink-mid hover:text-ink-deep'} ${v.transcribing ? 'cursor-wait opacity-70' : ''} ${className}`}
        style={{ background: 'var(--paper-light)' }}
      >
        {v.transcribing ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.2-8.56" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2.5" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
          </svg>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {v.error ?? (v.listening ? '正在录音' : v.transcribing ? '正在识别' : '')}
      </span>
    </>
  );
}
