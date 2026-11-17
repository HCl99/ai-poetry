import { prisma } from '@/lib/prisma';
import { STAGE_POEMS, normalizeStage, type Stage } from '@/lib/classics';

/** 学段题库 ID 缓存：首次按 title+author 解析，之后直接用主键取诗 */
const idCache = new Map<Stage, string[]>();

const CN = /[\u4e00-\u9fff]/g;

function usableLines(paragraphsSimp: unknown): string[] {
  const arr = (paragraphsSimp as string[] | null) || [];
  return arr.map((s) => String(s).trim()).filter((s) => (s.match(CN) || []).length >= 4);
}

/** 读取用户学段（未设置时按初中） */
export async function getUserStage(userId: string): Promise<Stage> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { stage: true } });
  return normalizeStage(u?.stage);
}

/** 解析某学段的必背篇目在诗库中的 ID（进程内缓存，避免每次请求全表扫描） */
export async function classicPoemIds(stage: Stage): Promise<string[]> {
  const hit = idCache.get(stage);
  if (hit) return hit;

  const pairs = STAGE_POEMS[stage];
  const rows = await prisma.poem.findMany({
    where: { OR: pairs.map((p) => ({ title: { startsWith: p.title }, author: p.author })) },
    select: { id: true, paragraphsSimp: true },
    take: 400,
  });
  const ids = rows.filter((r) => usableLines(r.paragraphsSimp).length >= 2).map((r) => r.id);
  idCache.set(stage, ids);
  return ids;
}

/** 从学段题库随机取一首诗的 ID，exclude 用于「换一首」避开当前诗 */
export async function randomClassicId(stage: Stage, exclude?: string): Promise<string | null> {
  const ids = await classicPoemIds(stage);
  if (!ids.length) return null;
  for (let i = 0; i < 8; i++) {
    const pick = ids[Math.floor(Math.random() * ids.length)];
    if (pick !== exclude) return pick;
  }
  return ids[0] === exclude ? null : ids[0];
}

/** 按日期散列固定取一首（每日一诗），当学段题库变动时自然轮换 */
export async function dailyClassicId(stage: Stage): Promise<string | null> {
  const ids = await classicPoemIds(stage);
  if (!ids.length) return null;
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % ids.length;
  return ids[h];
}
