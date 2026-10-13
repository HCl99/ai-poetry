'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * F6 朗读增强：Web Speech API 封装
 * - 语速（0.5-2.0）与中文音色选择，localStorage 持久化（key: speech-settings）
 * - speakLines 逐句朗读并回调当前句 index（用于诗句高亮）
 * - speak 单段朗读（注解维度/生成的诗）
 */
export interface SpeechOption {
  rate: number;
  voiceURI: string | null;
}

const SETTINGS_KEY = 'speech-settings';
const DEFAULT_SETTINGS: SpeechOption = { rate: 0.9, voiceURI: null };

export function useSpeech() {
  const [supported, setSupported] = useState(true);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState(-1);
  const [settings, setSettings] = useState<SpeechOption>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!('speechSynthesis' in window)) { setSupported(false); return; }
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
    } catch { /* ignore */ }
    const load = () => {
      const zh = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('zh'));
      setVoices(zh.length ? zh : window.speechSynthesis.getVoices().slice(0, 8));
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const updateSettings = useCallback((patch: Partial<SpeechOption>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeakingKey(null);
    setActiveLine(-1);
  }, []);

  /** 单段朗读（再次调用同一 key 停止） */
  const speak = useCallback((key: string, text: string) => {
    if (!('speechSynthesis' in window)) return;
    if (speakingKey === key) { stop(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = settingsRef.current.rate;
    const voice = settingsRef.current.voiceURI
      ? window.speechSynthesis.getVoices().find((v) => v.voiceURI === settingsRef.current.voiceURI)
      : undefined;
    if (voice) u.voice = voice;
    u.onend = () => { setSpeakingKey(null); };
    u.onerror = () => { setSpeakingKey(null); };
    setSpeakingKey(key);
    window.speechSynthesis.speak(u);
  }, [speakingKey, stop]);

  /** 逐句朗读：lines 依次入队，activeLine 指示当前句（-1 表示未在朗读） */
  const speakLines = useCallback((key: string, lines: string[]) => {
    if (!('speechSynthesis' in window)) return;
    if (speakingKey === key) { stop(); return; }
    window.speechSynthesis.cancel();
    const { rate, voiceURI } = settingsRef.current;
    const voice = voiceURI ? window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI) : undefined;
    lines.forEach((line, i) => {
      const u = new SpeechSynthesisUtterance(line);
      u.lang = 'zh-CN';
      u.rate = rate;
      if (voice) u.voice = voice;
      u.onstart = () => setActiveLine(i);
      if (i === lines.length - 1) {
        u.onend = () => { setSpeakingKey(null); setActiveLine(-1); };
        u.onerror = () => { setSpeakingKey(null); setActiveLine(-1); };
      }
      window.speechSynthesis.speak(u);
    });
    setSpeakingKey(key);
    setActiveLine(0);
  }, [speakingKey, stop]);

  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);

  return { supported, speakingKey, activeLine, settings, voices, updateSettings, speak, speakLines, stop };
}
