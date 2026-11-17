'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolvePreset,
  withClausePunct,
  pauseAfter,
  type EmotionKey,
  type VoicePreset,
} from '@/lib/voice-presets';

/**
 * F6 朗读增强
 * - 首选本地神经音色服务（/api/tts → scripts/tts_server.py，8102）：按诗人气质选音色与语速/音高，
 *   朗读有抑扬顿挫；服务不可用时自动降级为浏览器 speechSynthesis。
 * - speakLines 逐句播放并回调当前句 index（用于诗句高亮）。
 * - 语速（0.5-2.0）、音色、朗读风格持久化到 localStorage（key: speech-settings）。
 */
export interface SpeechOption {
  rate: number;
  voiceURI: string | null;
  emotion: EmotionKey;
}

const SETTINGS_KEY = 'speech-settings';
const DEFAULT_SETTINGS: SpeechOption = { rate: 0.9, voiceURI: null, emotion: 'auto' };

/** 语音片段缓存：重复朗读同一句不再请求服务端（最多 60 条，淘汰最旧） */
const ttsCache = new Map<string, string>();

function cachePut(key: string, url: string) {
  if (ttsCache.size >= 60) {
    const first = ttsCache.keys().next().value;
    if (first) {
      URL.revokeObjectURL(ttsCache.get(first) as string);
      ttsCache.delete(first);
    }
  }
  ttsCache.set(key, url);
}

/** 用户语速滑块相对预设基准的增量（预设已自带风格基准，这里只做上下微调） */
function rateWithUser(base: string, userRate: number): string {
  const m = base.match(/([+-]?\d+)%/);
  const basePct = m ? Number(m[1]) : 0;
  const total = Math.max(-60, Math.min(60, Math.round(basePct + (userRate - 0.9) * 100)));
  return `${total >= 0 ? '+' : ''}${total}%`;
}

async function fetchTtsUrl(text: string, preset: VoicePreset): Promise<string | null> {
  const key = `${preset.voice}|${preset.rate}|${preset.pitch}|${preset.volume}|${text}`;
  const hit = ttsCache.get(key);
  if (hit) return hit;
  const r = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: preset.voice,
      rate: preset.rate,
      pitch: preset.pitch,
      volume: preset.volume,
    }),
  });
  if (!r.ok) return null;
  const blob = await r.blob();
  if (!blob.size) return null;
  const url = URL.createObjectURL(blob);
  cachePut(key, url);
  return url;
}

export function useSpeech() {
  const [supported, setSupported] = useState(true);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState(-1);
  const [settings, setSettings] = useState<SpeechOption>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 播放代次：停止 / 重新朗读时自增，用于丢弃已经过期的异步结果 */
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!('speechSynthesis' in window) && typeof Audio === 'undefined') {
      setSupported(false);
      return;
    }
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
    } catch {
      /* ignore */
    }
    if (!('speechSynthesis' in window)) return;
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
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    const a = audioRef.current;
    if (a) {
      a.onended = null;
      a.onerror = null;
      a.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeakingKey(null);
    setActiveLine(-1);
  }, []);

  const playUrl = useCallback(
    (url: string) =>
      new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onpause = () => resolve(); // 主动停止时也要让顺序播放的 await 返回
        audio.onerror = () => reject(new Error('audio'));
        audio.play().catch(reject);
      }),
    [],
  );

  /** 降级：浏览器系统音色（无神经音色，但保留音高差异） */
  const browserSpeak = useCallback((text: string, preset: VoicePreset) => {
    if (!('speechSynthesis' in window)) {
      setSpeakingKey(null);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = settingsRef.current.rate;
    u.pitch = preset.browserPitch;
    const { voiceURI } = settingsRef.current;
    const voice = voiceURI ? window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI) : undefined;
    if (voice) u.voice = voice;
    u.onend = () => setSpeakingKey(null);
    u.onerror = () => setSpeakingKey(null);
    window.speechSynthesis.speak(u);
  }, []);

  const browserSpeakLines = useCallback((lines: string[], preset: VoicePreset) => {
    if (!('speechSynthesis' in window)) {
      setSpeakingKey(null);
      return;
    }
    const { rate, voiceURI } = settingsRef.current;
    const voice = voiceURI ? window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI) : undefined;
    lines.forEach((line, i) => {
      const u = new SpeechSynthesisUtterance(line);
      u.lang = 'zh-CN';
      u.rate = rate;
      u.pitch = preset.browserPitch;
      if (voice) u.voice = voice;
      u.onstart = () => setActiveLine(i);
      if (i === lines.length - 1) {
        u.onend = () => {
          setSpeakingKey(null);
          setActiveLine(-1);
        };
        u.onerror = () => {
          setSpeakingKey(null);
          setActiveLine(-1);
        };
      }
      window.speechSynthesis.speak(u);
    });
    setActiveLine(0);
  }, []);

  /** 单段朗读（再次调用同一 key 停止）；emotion 不传则用设置里的风格 */
  const speak = useCallback(
    (key: string, text: string, emotion?: EmotionKey) => {
      if (speakingKey === key) {
        stop();
        return;
      }
      stop();
      const preset = resolvePreset(emotion ?? settingsRef.current.emotion, text);
      const effective: VoicePreset = { ...preset, rate: rateWithUser(preset.rate, settingsRef.current.rate) };
      setSpeakingKey(key);
      const token = tokenRef.current;
      fetchTtsUrl(text, effective)
        .then(async (url) => {
          if (token !== tokenRef.current) return;
          if (!url) {
            browserSpeak(text, preset);
            return;
          }
          await playUrl(url);
          if (token === tokenRef.current) setSpeakingKey(null);
        })
        .catch(() => {
          if (token === tokenRef.current) browserSpeak(text, preset);
        });
    },
    [speakingKey, stop, playUrl, browserSpeak],
  );

  /** 逐句朗读：先用服务端音色并行合成，再按句顺序播放（句间按句读停顿），activeLine 指示当前句 */
  const speakLines = useCallback(
    (key: string, lines: string[], emotion?: EmotionKey) => {
      if (speakingKey === key) {
        stop();
        return;
      }
      stop();
      const spoken = lines.map((line, i) => withClausePunct(line, i));
      const preset = resolvePreset(emotion ?? settingsRef.current.emotion, spoken.join(''));
      const effective: VoicePreset = { ...preset, rate: rateWithUser(preset.rate, settingsRef.current.rate) };
      setSpeakingKey(key);
      const token = tokenRef.current;
      void (async () => {
        try {
          const urls = await Promise.all(spoken.map((line) => fetchTtsUrl(line, effective)));
          if (token !== tokenRef.current) return;
          if (urls.some((u) => !u)) throw new Error('tts-unavailable');
          for (let i = 0; i < urls.length; i++) {
            if (token !== tokenRef.current) return;
            setActiveLine(i);
            await playUrl(urls[i] as string);
            if (i < urls.length - 1) {
              await new Promise((r) => setTimeout(r, pauseAfter(spoken[i], i, spoken.length)));
              if (token !== tokenRef.current) return;
            }
          }
          if (token === tokenRef.current) {
            setActiveLine(-1);
            setSpeakingKey(null);
          }
        } catch {
          if (token === tokenRef.current) browserSpeakLines(spoken, preset);
        }
      })();
    },
    [speakingKey, stop, playUrl, browserSpeakLines],
  );

  useEffect(
    () => () => {
      tokenRef.current += 1;
      audioRef.current?.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    [],
  );

  return { supported, speakingKey, activeLine, settings, voices, updateSettings, speak, speakLines, stop };
}
