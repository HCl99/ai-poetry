'use client';

import { useVoiceInput } from '@/lib/use-voice-input';

/**
 * 语音输入按钮（麦克风）：识别结果回填宿主输入框。
 * 不支持时返回 null，不占位、不干扰布局；识别失败通过 title 与 aria-live 文案提示。
 */
export function VoiceInputButton({
  onText,
  size = 'md',
  className = '',
}: {
  onText: (text: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const v = useVoiceInput(onText);
  if (!v.supported) return null;

  const box = size === 'sm' ? 'h-9 w-9' : 'h-[42px] w-[42px]';

  return (
    <>
      <button
        type="button"
        onClick={v.start}
        aria-label={v.listening ? '正在聆听，点击取消' : '语音输入'}
        aria-pressed={v.listening}
        title={v.error ?? (v.listening ? '正在聆听，点击取消' : '语音输入（Chrome / Edge）')}
        className={`${box} flex shrink-0 items-center justify-center rounded-xl border transition-ink ${v.listening ? 'anim-pulse-ring border-rose-c text-rose-c' : 'border-c text-ink-soft hover:border-ink-mid hover:text-ink-deep'} ${className}`}
        style={{ background: 'var(--paper-light)' }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2.5" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
        </svg>
      </button>
      <span className="sr-only" aria-live="polite">
        {v.error ?? (v.listening ? '语音识别进行中' : '')}
      </span>
    </>
  );
}
