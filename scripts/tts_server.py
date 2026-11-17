# -*- coding: utf-8 -*-
"""
本地情感语音合成服务（神经音色，离线免费）
- 引擎：edge-tts（微软 Edge 在线神经音色，无需 API Key）
- 端口：8102，供 Next.js /api/tts 调用
- 接口：GET /health，POST /tts（JSON: text/voice/rate/pitch/volume）→ audio/mpeg
- 情感不是贴标签，而是通过音色 + 语速 + 音高 + 音量四维参数表达：
  李白豪放（快、亮、响）、杜甫沉郁（慢、低、顿挫）、李清照婉约（慢、柔、偏高）等
"""
import asyncio
import io
import re
import wave

import av
import edge_tts
import numpy as np
from flask import Flask, jsonify, request, Response

app = Flask(__name__)

DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'
ALLOWED_VOICES = {
    'zh-CN-XiaoxiaoNeural',
    'zh-CN-XiaoyiNeural',
    'zh-CN-YunxiNeural',
    'zh-CN-YunjianNeural',
    'zh-CN-YunyangNeural',
}
PCT_RE = re.compile(r'^[+-]\d{1,2}%$')
HZ_RE = re.compile(r'^[+-]\d{1,2}Hz$')


def _safe(value: str, pattern: re.Pattern, fallback: str) -> str:
    return value if isinstance(value, str) and pattern.match(value) else fallback


async def _synth(text: str, voice: str, rate: str, pitch: str, volume: str) -> bytes:
    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume=volume)
    buf = bytearray()
    async for chunk in comm.stream():
        if chunk.get('type') == 'audio' and chunk.get('data'):
            buf.extend(chunk['data'])
    return bytes(buf)


def _trim_to_wav(mp3: bytes, threshold: float = 0.01, keep_ms: int = 40) -> tuple[bytes, str]:
    """
    edge-tts 每段音频末尾固定带 ~0.6s 静音，句句独立合成就显得拖沓。
    这里解码后裁掉首尾静音，再封装成 PCM WAV 返回，句间停顿完全由前端按句读控制。
    """
    with av.open(io.BytesIO(mp3)) as container:
        stream = container.streams.audio[0]
        rate = stream.rate
        frames = [f.to_ndarray().reshape(-1) for f in container.decode(stream)]
    if not frames:
        return mp3, 'audio/mpeg'
    pcm = np.concatenate(frames).astype(np.float32)
    if pcm.size == 0:
        return mp3, 'audio/mpeg'
    mask = np.abs(pcm) > threshold
    if not mask.any():
        return mp3, 'audio/mpeg'
    start = int(np.argmax(mask))
    end = len(mask) - int(np.argmax(mask[::-1]))
    pad = int(rate * keep_ms / 1000)
    start = max(0, start - pad)
    end = min(len(pcm), end + pad)
    pcm = pcm[start:end]
    # 收尾 15ms 淡出，避免裁切静音时产生爆音
    fade = min(int(rate * 0.015), len(pcm) // 2)
    if fade > 0:
        pcm[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)
    data16 = np.clip(pcm * 32767.0, -32768, 32767).astype(np.int16)

    out = io.BytesIO()
    with wave.open(out, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(data16.tobytes())
    return out.getvalue(), 'audio/wav'


@app.get('/health')
def health():
    return jsonify({'ok': True, 'tts': True, 'engine': 'edge-tts'})


@app.post('/tts')
def tts():
    body = request.get_json(silent=True) or {}
    text = str(body.get('text') or '').strip()
    if not text:
        return jsonify({'error': '缺少 text'}), 400
    if len(text) > 600:
        return jsonify({'error': '文本过长（单次 ≤ 600 字）'}), 400

    voice = body.get('voice') if body.get('voice') in ALLOWED_VOICES else DEFAULT_VOICE
    rate = _safe(body.get('rate'), PCT_RE, '+0%')
    pitch = _safe(body.get('pitch'), HZ_RE, '+0Hz')
    volume = _safe(body.get('volume'), PCT_RE, '+0%')

    try:
        raw = asyncio.run(_synth(text, voice, rate, pitch, volume))
        data, mime = _trim_to_wav(raw) if raw else (b'', 'audio/mpeg')
    except Exception as e:  # noqa: BLE001
        return jsonify({'error': f'语音合成失败：{type(e).__name__}'}), 502
    if not data:
        return jsonify({'error': '语音合成结果为空'}), 502
    return Response(data, mimetype=mime, headers={'Cache-Control': 'no-store'})


if __name__ == '__main__':
    print('TTS service on http://127.0.0.1:8102')
    app.run(host='127.0.0.1', port=8102, threaded=True)
