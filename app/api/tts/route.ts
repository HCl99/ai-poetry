import { auth } from '@/auth';
import { checkAiRateLimit } from '@/lib/rateLimit';
import { ALLOWED_VOICES } from '@/lib/voice-presets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PCT_RE = /^[+-]\d{1,2}%$/;
const HZ_RE = /^[+-]\d{1,2}Hz$/;

/**
 * 情感语音合成（服务端代理）
 * 前端把「文本 + 音色 + 语速/音高/音量」POST 到这里，转发给本机 edge-tts 服务
 * （scripts/tts_server.py，8102），返回 audio/mpeg 供 <audio> 直接播放。
 * 服务不可用时返回 503，前端自动降级为浏览器 speechSynthesis。
 */
export async function POST(req: Request) {
  const session = await auth();
  const limited = session?.user?.id ? checkAiRateLimit(session.user.id, 'tts', 60) : null;
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return Response.json({ error: '缺少朗读文本' }, { status: 400 });
  if (text.length > 600) return Response.json({ error: '朗读文本过长' }, { status: 400 });

  const voice = ALLOWED_VOICES.has(String(body?.voice)) ? String(body.voice) : 'zh-CN-XiaoxiaoNeural';
  const rate = PCT_RE.test(String(body?.rate)) ? String(body.rate) : '+0%';
  const pitch = HZ_RE.test(String(body?.pitch)) ? String(body.pitch) : '+0Hz';
  const volume = PCT_RE.test(String(body?.volume)) ? String(body.volume) : '+0%';

  const base = (process.env.TTS_BASE_URL || 'http://127.0.0.1:8102').replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate, pitch, volume }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return Response.json({ error: d?.error || '语音合成服务异常' }, { status: 502 });
    }
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: {
        'Content-Type': r.headers.get('content-type') || 'audio/wav',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      { error: '本地语音合成服务未启动：请运行 python scripts/tts_server.py（8102 端口）' },
      { status: 503 },
    );
  }
}
