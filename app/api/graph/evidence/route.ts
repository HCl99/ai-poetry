import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

/** 按中文句读切句，过滤过短的片段（多为标点残片） */
const splitSentences = (text: string) =>
  text
    .split(/[。！？；\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6);

/** 诗人关系证据：从双方小传原文中摘出提到对方的句子 */
async function GET_impl(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const url = new URL(req.url);
  const focus = url.searchParams.get('focus')?.trim() || '';
  const names = (url.searchParams.get('names') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!focus || names.length === 0) return Response.json({ evidence: {} });

  const bios = await prisma.poetBio.findMany({
    where: { name: { in: [focus, ...names] } },
    select: { name: true, bioSimp: true, bioDesc: true },
  });
  // bioSimp 与关系表中的简体姓名同形，优先用它做匹配；缺失时退回繁体原文
  const bioMap = new Map(bios.map((b) => [b.name, b.bioSimp || b.bioDesc || '']));
  const focusBio = bioMap.get(focus) || '';

  const evidence: Record<string, string[]> = {};
  for (const n of names) {
    const nb = bioMap.get(n) || '';
    const out: string[] = [];
    // 对方小传提到焦点诗人（最常见方向）
    for (const s of splitSentences(nb)) {
      if (out.length >= 2) break;
      if (s.includes(focus) && !out.includes(s)) out.push(s);
    }
    // 焦点诗人小传提到对方（补充方向）
    for (const s of splitSentences(focusBio)) {
      if (out.length >= 2) break;
      if (s.includes(n) && !out.includes(s)) out.push(s);
    }
    evidence[n] = out;
  }

  return Response.json({ evidence });
}

export const GET = withApi(GET_impl);
