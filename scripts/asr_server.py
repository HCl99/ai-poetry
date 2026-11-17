# -*- coding: utf-8 -*-
"""
本地语音识别服务（离线，不依赖 Google 语音接口）
- 引擎：faster-whisper small（int8 / CPU），中文
- 端口：8101，供 Next.js /api/asr 调用
- 输入：任意浏览器录音格式（webm/ogg/wav/mp4），由 PyAV 解码
"""
import io
import threading

import av
import numpy as np
from flask import Flask, jsonify, request
from faster_whisper import WhisperModel

app = Flask(__name__)
MODEL = None
LOCK = threading.Lock()


def get_model() -> WhisperModel:
    global MODEL
    if MODEL is None:
        with LOCK:
            if MODEL is None:
                MODEL = WhisperModel('small', device='cpu', compute_type='int8')
    return MODEL


def decode_audio(data: bytes) -> np.ndarray:
    """把任意容器格式解码成 16k 单声道 float32，绕开 faster-whisper 对特定 PyAV 版本的依赖"""
    with av.open(io.BytesIO(data)) as container:
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
        chunks = []
        for frame in container.decode(stream):
            for f in resampler.resample(frame):
                chunks.append(f.to_ndarray().reshape(-1))
        for f in resampler.resample(None):
            chunks.append(f.to_ndarray().reshape(-1))
    if not chunks:
        return np.zeros(0, dtype=np.float32)
    pcm = np.concatenate(chunks).astype(np.float32) / 32768.0
    return pcm


@app.get('/health')
def health():
    return jsonify({'ok': True, 'asr': True, 'loaded': MODEL is not None})


@app.post('/asr')
def asr():
    f = request.files.get('audio')
    if f is None:
        return jsonify({'error': '缺少 audio 文件'}), 400
    data = f.read()
    if len(data) < 200:
        return jsonify({'error': '音频为空'}), 400
    try:
        pcm = decode_audio(data)
        if pcm.size < 1600:  # 少于 0.1s
            return jsonify({'text': ''})
        # 先在锁外取模型：get_model 内部自身会加锁，若在 LOCK 内调用会自锁死
        model = get_model()
        with LOCK:
            segs, _ = model.transcribe(
                pcm,
                language='zh',
                beam_size=10,
                vad_filter=True,
                temperature=0,
                condition_on_previous_text=False,
                # 用常见诗题/诗人做提示，明显提升「赠汪伦」这类短专名的准确率
                initial_prompt='以下是唐诗宋词的诗题、词牌与诗人名：静夜思、赠汪伦、春晓、登鹳雀楼、望庐山瀑布、早发白帝城、黄鹤楼送孟浩然之广陵、将进酒、春望、登高、茅屋为秋风所破歌、琵琶行、长恨歌、水调歌头、念奴娇赤壁怀古、定风波、浣溪沙、如梦令、声声慢、青玉案元夕、李白、杜甫、王维、苏轼、李清照、辛弃疾、白居易、李商隐、杜牧、孟浩然、王昌龄、王之涣、柳宗元、欧阳修、王安石、陆游。',
            )
            text = ''.join(s.text for s in segs).strip()
        # 去掉模型偶发的标点与空白
        text = text.strip('，。！？、,.!? ')
        return jsonify({'text': text})
    except Exception as e:  # noqa: BLE001
        return jsonify({'error': f'识别失败：{type(e).__name__}'}), 500


if __name__ == '__main__':
    print('ASR service on http://127.0.0.1:8101')
    app.run(host='127.0.0.1', port=8101, threaded=True)
