import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

const MODE_LABEL: Record<string, string> = {
  mask: '遮蔽填空',
  first: '首字提示',
};

/** 背诵闯关成绩落库：写入 history，驱动学习路径「启蒙诵读」进度 */
async function POST_impl(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const uid = session.user.id;

  const body = (await req.json().catch(() => ({}))) as {
    poemId?: string; title?: string; mode?: string; total?: number; correct?: number;
  };
  const { poemId, title, mode } = body;
  const total = Number(body.total) || 0;
  const correct = Math.max(0, Math.min(Number(body.correct) || 0, total));
  if (!poemId || !title || !total) return Response.json({ error: '参数不完整' }, { status: 400 });

  await prisma.history.create({
    data: {
      userId: uid,
      actionType: 'recite',
      targetId: poemId,
      title: `背诵闯关《${String(title).slice(0, 60)}》`,
      detail: `${MODE_LABEL[mode || ''] || '背诵'} · 答对 ${correct}/${total} 句`,
    },
  });

  // 学习路径进度：研习诗词去重数（含本次闯关诗篇）
  const distinct = await prisma.history.findMany({
    where: { userId: uid, targetId: { not: null } },
    distinct: ['targetId'],
    select: { targetId: true },
  });
  return Response.json({ ok: true, readCount: distinct.length });
}

export const POST = withApi(POST_impl);
