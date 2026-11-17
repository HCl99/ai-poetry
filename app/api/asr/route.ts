import { auth } from '@/auth';
import { checkAiRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 语音转文字（服务端代理）
 * 浏览器 MediaRecorder 录到的音频 POST 到这里，转发给本机 faster-whisper 服务（scripts/asr_server.py，8101）。
 * 不依赖 Chrome 的 Web Speech（其识别需要访问 Google 服务，国内网络下不可用）。
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'asr', 30);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const file = form?.get('audio');
  if (!file || !(file instanceof Blob)) return Response.json({ error: '缺少音频数据' }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return Response.json({ error: '录音过长，请控制在 10 秒内' }, { status: 400 });

  const base = (process.env.ASR_BASE_URL || 'http://127.0.0.1:8101').replace(/\/$/, '');
  const fd = new FormData();
  fd.append('audio', file, 'voice.webm');
  try {
    const r = await fetch(`${base}/asr`, { method: 'POST', body: fd, signal: AbortSignal.timeout(45_000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return Response.json({ error: d?.error || '本地语音识别服务异常' }, { status: 502 });
    return Response.json({ text: String(d?.text || '').trim() });
  } catch {
    return Response.json(
      { error: '本地语音识别服务未启动：请运行 python scripts/asr_server.py（8101 端口）' },
      { status: 503 },
    );
  }
}
