import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

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

/** 每日一诗：按日期字符串散列，当日固定、隔日轮换（与工作台同一逻辑） */
function dayIndexOf(total: number): number {
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % Math.max(total, 1);
  return h;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source') || 'daily';
  const poemId = searchParams.get('poemId');

  type PoemRow = { id: string; title: string; author: string; dynasty: string; paragraphsSimp: unknown };
  let poem: PoemRow | null = null;

  if (poemId) {
    poem = await prisma.poem.findUnique({ where: { id: poemId }, select: POEM_SELECT });
  } else if (source === 'fav') {
    // 从我的收藏中随机抽一首
    const favs = await prisma.favorite.findMany({
      where: { userId: session.user.id },
      select: { poemId: true },
      take: 200,
    });
    if (favs.length) {
      const pick = favs[Math.floor(Math.random() * favs.length)];
      poem = await prisma.poem.findUnique({ where: { id: pick.poemId }, select: POEM_SELECT });
    }
  } else if (source === 'daily') {
    const where = { annotations: { isNot: null }, tags: { not: '[]' } } as const;
    const total = await prisma.poem.count({ where });
    if (total) {
      poem = await prisma.poem.findFirst({ where, select: POEM_SELECT, skip: dayIndexOf(total) });
    }
  }

  // 兜底/随机经典：随机偏移抽诗，重试至句数合适
  if (!poem || pickLines(poem).length < 2) {
    const where = { tags: { not: '[]' } } as const;
    const total = await prisma.poem.count({ where });
    for (let i = 0; i < 6; i++) {
      const cand = await prisma.poem.findFirst({
        where,
        select: POEM_SELECT,
        skip: Math.floor(Math.random() * Math.max(total, 1)),
      });
      if (cand && pickLines(cand).length >= 2) { poem = cand; break; }
    }
  }

  if (!poem) return Response.json({ error: '未找到合适诗篇' }, { status: 404 });
  return Response.json({
    id: poem.id,
    title: poem.title,
    author: poem.author,
    dynasty: poem.dynasty,
    lines: pickLines(poem),
  });
}
