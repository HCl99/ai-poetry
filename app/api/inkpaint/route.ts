import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { checkAiRateLimit } from '@/lib/rateLimit';
import { screenInput } from '@/lib/content-filter';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 把智谱返回的临时 URL 落成本地文件。
 * 临时链接会过期，落库后才能长期回溯；失败时退回原链接，不阻断本次生成。
 */
async function persistImage(remoteUrl: string): Promise<string | null> {
  try {
    const r = await fetch(remoteUrl);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength === 0) return null;
    const dir = path.join(process.cwd(), 'public', 'creations');
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.png`;
    await writeFile(path.join(dir, name), buf);
    return `/creations/${name}`;
  } catch (e) {
    console.error('persist image error', (e as Error)?.message);
    return null;
  }
}

/** 水墨意境图生成：智谱 CogView-3-Flash 文生图，强制水墨画风格约束 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'inkpaint', 6);
  if (limited) return limited;

  const { prompt } = (await req.json()) as { prompt?: string };
  if (!prompt?.trim()) return Response.json({ error: '缺少 prompt' }, { status: 400 });

  const screen = screenInput(prompt);
  if (!screen.ok) return Response.json({ error: screen.reason }, { status: 400 });

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

  // 落盘 + 记录，便于「我的创作」回溯；任一步失败都不影响本次返回
  const localUrl = await persistImage(url);
  const finalUrl = localUrl || url;
  try {
    await prisma.aiCreation.create({
      data: {
        userId: session.user.id,
        kind: 'inkpaint',
        prompt: prompt.trim().slice(0, 180),
        imageUrl: finalUrl,
        result: { model: 'cogview-3-flash', persisted: Boolean(localUrl) },
      },
    });
  } catch (e) {
    console.error('save creation error', (e as Error)?.message);
  }
  return Response.json({ url: finalUrl });
}
