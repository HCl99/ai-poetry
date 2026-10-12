import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

const strip = (s: string) => s.replace(/[，。？！、；：''""\s《》·\-—]/g, '');

interface Source { title: string; author: string; dynasty: string }
interface PoemRow { id: string; title: string; author: string; dynasty: string; paragraphs_simp: string | null; paragraphs: string }

/** 从正文 JSON（可能是字符串或 $queryRaw 已解析的数组）里取出包含令字的那个单句 */
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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const { char, played, playerLine } = (await req.json()) as { char?: string; played?: string[]; playerLine?: string };
  if (!char || !/^[\u4e00-\u9fa5]$/.test(char)) return Response.json({ error: '令字必须是单个汉字' }, { status: 400 });
  if (!playerLine?.trim()) return Response.json({ error: '请输入诗句' }, { status: 400 });

  const used = (played || []).map(strip);
  const norm = strip(playerLine);

  /* ---- 硬校验 1：必须包含令字 ---- */
  if (!norm.includes(char)) {
    return Response.json({ valid: false, reason: `诗句中需要包含令字「${char}」` });
  }
  /* ---- 硬校验 2：不能重复 ---- */
  if (used.includes(norm)) {
    return Response.json({ valid: false, reason: '这句已经有人说过了，换一句' });
  }

  /* ---- 库内验证：全库 LIKE 精确匹配该句 ---- */
  const rows = await prisma.$queryRaw<PoemRow[]>`
    SELECT id, title, author, dynasty, paragraphs_simp, paragraphs
    FROM poems
    WHERE CONCAT(IFNULL(paragraphs_simp,''), paragraphs) LIKE ${'%' + playerLine.trim() + '%'}
    LIMIT 5`;
  let source: Source | null = null;
  let judged = false;
  if (rows.length > 0) {
    source = { title: rows[0].title, author: rows[0].author, dynasty: rows[0].dynasty };
  } else {
    /* ---- 库中未命中 → GLM 判定是否为真实古典诗句 ---- */
    try {
      const jr = await client.chat.completions.create({
        model: 'glm-4-flash',
        messages: [
          { role: 'system', content: '你是诗词审校专家，只输出 JSON，不输出任何其他文字。' },
          {
            role: 'user',
            content: `令字为「${char}」。用户给出的诗句：「${playerLine.trim().slice(0, 60)}」。请判断：(1) 是否为中国古典诗词（先秦至清代）中真实存在的诗句或广为流传的名句；(2) 该句是否包含令字「${char}」。若两项都满足输出 {"ok":true,"reason":"20字内理由"}，否则输出 {"ok":false,"reason":"20字内理由"}。`,
          },
        ],
        temperature: 0.1,
        max_tokens: 100,
      });
      const txt = jr.choices?.[0]?.message?.content || '';
      const m = txt.match(/\{[\s\S]*\}/);
      const j = m ? JSON.parse(m[0]) : { ok: false, reason: '无法核实该句真伪' };
      if (!j.ok) return Response.json({ valid: false, reason: `查无此句：${j.reason || '请确认是真实诗句'}` });
      judged = true;
    } catch {
      return Response.json({ valid: false, reason: '查无此句，请输入古籍中真实存在的诗句' });
    }
  }

  /* ---- AI 应战：从全库随机取含令字的诗句（保证真实可溯源） ---- */
  const pool = await prisma.$queryRaw<PoemRow[]>`
    SELECT id, title, author, dynasty, paragraphs_simp, paragraphs
    FROM poems
    WHERE CONCAT(IFNULL(paragraphs_simp,''), paragraphs) LIKE ${'%' + char + '%'}
    ORDER BY RAND()
    LIMIT 80`;
  const candidates: { text: string; source: Source }[] = [];
  for (const row of pool) {
    const line = lineContaining(row.paragraphs_simp ?? row.paragraphs, char);
    if (!line) continue;
    if (used.includes(strip(line))) continue;
    candidates.push({ text: line, source: { title: row.title, author: row.author, dynasty: row.dynasty } });
    if (candidates.length >= 12) break;
  }

  let aiLine: { text: string; source: Source } | null = null;
  if (candidates.length > 0) {
    aiLine = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    // AI 无句可应 → 用户获胜，记入学习历史
    await prisma.history.create({
      data: {
        userId: session.user.id,
        actionType: 'feihua',
        title: `飞花令「${char}」获胜`,
        detail: `AI 无句可应 · 你共对出 ${used.length + 1} 句`,
      },
    });
  }

  return Response.json({ valid: true, judged, source, aiLine });
}
