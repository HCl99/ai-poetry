import { auth } from '@/auth';
import { checkAiRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 水墨意境图生成：智谱 CogView-3-Flash 文生图，强制水墨画风格约束 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'inkpaint', 6);
  if (limited) return limited;

  const { prompt } = (await req.json()) as { prompt?: string };
  if (!prompt?.trim()) return Response.json({ error: '缺少 prompt' }, { status: 400 });

  const base = (process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
  const r = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ZHIPUAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'cogview-3-flash',
      prompt: `中国古典水墨画，淡雅留白，写意山水意境，画面中不出现文字：${prompt.slice(0, 180)}`,
      size: '1024x1024',
    }),
  });
  if (!r.ok) return Response.json({ error: `绘图服务异常 HTTP ${r.status}` }, { status: 502 });
  const d = await r.json();
  const url = d?.data?.[0]?.url;
  if (!url) return Response.json({ error: '绘图服务未返回图片' }, { status: 502 });
  return Response.json({ url });
}
