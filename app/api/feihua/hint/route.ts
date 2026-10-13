import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const strip = (s: string) => s.replace(/[，。？！、；：''""\s《》·\-—]/g, '');

interface PoemRow { title: string; author: string; dynasty: string; paragraphs_simp: string | null; paragraphs: string }

function lineContaining(val: unknown, char: string): string | null {
  let arr: unknown = val;
  if (typeof val === 'string') {
    try { arr = JSON.parse(val); } catch { return null; }
  }
  if (Array.isArray(arr)) {
    for (const l of arr) {
      if (typeof l === 'string' && strip(l).includes(char)) return l;
    }
  }
  return null;
}

/** F4 飞花令：求提示——从全库找一句未使用过的含令字诗句（每局限 3 次，前端控制置灰） */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const rl = rateLimit(`feihua-hint:${session.user.id}`, 10, 60_000);
  if (!rl.ok) return Response.json({ error: `操作过于频繁，请 ${rl.retryAfterSec} 秒后再试` }, { status: 429 });

  const { char, played } = (await req.json()) as { char?: string; played?: string[] };
  if (!char || !/^[\u4e00-\u9fa5]$/.test(char)) return Response.json({ error: '令字非法' }, { status: 400 });

  const used = new Set((played || []).map(strip));

  const pool = await prisma.$queryRaw<PoemRow[]>`
    SELECT title, author, dynasty, paragraphs_simp, paragraphs
    FROM poems
    WHERE CONCAT(IFNULL(paragraphs_simp,''), paragraphs) LIKE ${'%' + char + '%'}
    ORDER BY RAND()
    LIMIT 60`;

  const candidates: { text: string; source: { title: string; author: string; dynasty: string } }[] = [];
  for (const row of pool) {
    const line = lineContaining(row.paragraphs_simp ?? row.paragraphs, char);
    if (!line) continue;
    const key = strip(line);
    if (used.has(key) || key.length < 3) continue;
    candidates.push({ text: line, source: { title: row.title, author: row.author, dynasty: row.dynasty } });
    if (candidates.length >= 5) break;
  }

  if (candidates.length === 0) return Response.json({ exhausted: true });
  const hint = candidates[Math.floor(Math.random() * candidates.length)];
  return Response.json({ hint });
}
