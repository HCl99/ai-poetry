'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 语音输入（录音 → 本地识别）：
 * 浏览器 MediaRecorder 录音 → POST /api/asr → 本机 faster-whisper（scripts/asr_server.py，8101）识别，
 * 结果通过 onText 回填宿主输入框。
 * 不走 Chrome 的 Web Speech（其识别依赖 Google 服务，国内网络下必然失败、且无任何提示）。
 */
const MAX_MS = 10_000;
const MIN_BYTES = 1200;

type RecState = { rec: MediaRecorder; stream: MediaStream; timer: ReturnType<typeof setTimeout> } | null;

export function useVoiceInput(onText: (text: string) => void, onError?: (msg: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<RecState>(null);
  const cbRef = useRef(onText);
  cbRef.current = onText;
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== 'undefined',
    );
    return () => {
      const m = recRef.current;
      if (!m) return;
      clearTimeout(m.timer);
      m.stream.getTracks().forEach((t) => t.stop());
      if (m.rec.state !== 'inactive') m.rec.stop();
      recRef.current = null;
    };
  }, []);

  const fail = useCallback((msg: string) => {
    setError(msg);
    errRef.current?.(msg);
  }, []);

  /** 结束录音并触发识别 */
  const stop = useCallback(() => {
    const m = recRef.current;
    if (!m) return;
    clearTimeout(m.timer);
    recRef.current = null;
    if (m.rec.state !== 'inactive') m.rec.stop();
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    if (listening) {
      stop();
      return;
    }
    if (!supported) {
      fail('当前浏览器不支持录音，请使用 Chrome / Edge');
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < MIN_BYTES) {
          fail('没有录到声音，请靠近麦克风再试');
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append('audio', blob, 'voice.webm');
          const r = await fetch('/api/asr', { method: 'POST', body: fd });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d?.error || '语音识别失败');
          const text = String(d?.text || '').trim();
          if (!text) {
            fail('没听清，请再说一次');
            return;
          }
          cbRef.current(text);
        } catch (e) {
          fail(e instanceof Error ? e.message : '语音识别失败，请重试');
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      recRef.current = { rec, stream, timer: setTimeout(() => stop(), MAX_MS) };
      setListening(true);
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      fail(name === 'NotAllowedError' ? '麦克风权限被拒绝，请在地址栏允许后重试' : '无法访问麦克风，请检查设备');
    }
  }, [listening, supported, stop, fail]);

  return { supported, listening, transcribing, error, start, stop, clearError: () => setError(null) };
}
