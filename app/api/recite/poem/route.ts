import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';
import { STAGE_LABEL } from '@/lib/classics';
import { classicPoemIds, dailyClassicId, getUserStage, randomClassicId } from '@/lib/classic-pool';

export const dynamic = 'force-dynamic';

const POEM_SELECT = { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true } as const;

/** 提取适合闯关的诗句：每句至少 4 个汉字，最多取 8 句 */
function pickLines(p: { paragraphsSimp: unknown }): string[] {
  const arr = (p.paragraphsSimp as string[] | null) || [];
  return arr
    .map((s) => String(s).trim())
    .filter((s) => (s.match(/[\u4e00-\u9fff]/g) || []).length >= 4)
    .slice(0, 8);
}

/** 每日一诗：按日期字符串散列，当日固定、隔日轮换（逻辑见 classic-pool.dailyClassicId） */
async function GET_impl(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source') || 'random';
  const poemId = searchParams.get('poemId');
  const exclude = searchParams.get('exclude') || undefined;

  type PoemRow = { id: string; title: string; author: string; dynasty: string; paragraphsSimp: unknown };
  let poem: PoemRow | null = null;

  // 按用户学段从对应必背篇目抽题（小学/初中/高中三档）
  const stage = await getUserStage(session.user.id);
  const poolSize = (await classicPoemIds(stage)).length;
  const byId = (id: string) => prisma.poem.findUnique({ where: { id }, select: POEM_SELECT });

  if (poemId) {
    poem = await byId(poemId);
  } else if (source === 'fav') {
    // 从我的收藏中随机抽一首（避开 exclude，避免「换一首」抽回同一首）
    const favs = await prisma.favorite.findMany({
      where: { userId: session.user.id },
      select: { poemId: true },
      take: 200,
    });
    for (let i = 0; i < 5 && favs.length; i++) {
      const pick = favs[Math.floor(Math.random() * favs.length)];
      if (pick.poemId === exclude) continue;
      poem = await prisma.poem.findUnique({ where: { id: pick.poemId }, select: POEM_SELECT });
      if (poem) break;
    }
  } else if (source === 'daily') {
    let id = await dailyClassicId(stage);
    // 用户点「换一首」时换成同学段的其他篇目
    if (id && id === exclude) id = await randomClassicId(stage, exclude);
    if (id) poem = await byId(id);
  } else {
    const id = await randomClassicId(stage, exclude);
    if (id) poem = await byId(id);
  }

  // 兜底：学段题库异常时退回全库随机，保证页面可用
  if (!poem || pickLines(poem).length < 2) {
    const where = { tags: { not: '[]' } } as const;
    const total = await prisma.poem.count({ where });
    for (let i = 0; i < 6; i++) {
      const cand = await prisma.poem.findFirst({
        where,
        select: POEM_SELECT,
        skip: Math.floor(Math.random() * Math.max(total, 1)),
      });
      if (cand && cand.id !== exclude && pickLines(cand).length >= 2) { poem = cand; break; }
    }
  }

  if (!poem) return Response.json({ error: '未找到合适诗篇' }, { status: 404 });
  return Response.json({
    id: poem.id,
    title: poem.title,
    author: poem.author,
    dynasty: poem.dynasty,
    lines: pickLines(poem),
    stage,
    stageLabel: STAGE_LABEL[stage],
    poolSize,
  });
}

export const GET = withApi(GET_impl);
