'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech Recognition 封装（语音输入）：
 * 单次识别，结果通过 onText 回填到宿主输入框；与 lib/use-speech.ts（语音合成）互补，
 * 构成「说 → 检索/问答 → 听」的多模态闭环。零依赖、零 API 成本。
 */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results?: { [i: number]: { [j: number]: { transcript?: string } } } }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceInput(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const cbRef = useRef(onText);
  cbRef.current = onText;

  useEffect(() => {
    setSupported(Boolean(getCtor()));
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (listening) { stop(); return; }
    const Ctor = getCtor();
    if (!Ctor) { setError('当前浏览器不支持语音识别，请使用 Chrome / Edge'); return; }
    setError(null);
    const rec = new Ctor();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript?.trim() ?? '';
      if (text) cbRef.current(text);
    };
    rec.onerror = (e) => {
      setError(
        e?.error === 'not-allowed'
          ? '麦克风权限被拒绝，请在浏览器地址栏允许后重试'
          : e?.error === 'no-speech'
            ? '没有听清，请再说一次'
            : '语音识别失败，请重试',
      );
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }, [listening, stop]);

  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* ignore */ } }, []);

  return { supported, listening, error, start, stop, clearError: () => setError(null) };
}
