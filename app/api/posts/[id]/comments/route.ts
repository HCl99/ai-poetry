import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { findSensitiveWords } from '@/lib/community';

export const dynamic = 'force-dynamic';

/** 学习社区：帖子评论列表（平铺返回，含被回复人昵称，前端组装楼中楼） */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  let pid: bigint;
  try {
    pid = BigInt(params.id);
  } catch {
    return Response.json({ error: 'id 非法' }, { status: 400 });
  }
  const post = await prisma.post.findUnique({ where: { id: pid }, select: { id: true, status: true, userId: true } });
  if (!post || (post.status !== 'approved' && post.userId !== uid)) {
    return Response.json({ error: '帖子不存在' }, { status: 404 });
  }

  const rows = await prisma.comment.findMany({ where: { postId: pid }, orderBy: { createdAt: 'asc' } });

  const authorIds = [...new Set(rows.map((r) => r.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } });
  const nameMap = new Map(users.map((u) => [u.id, u.name || '诗友']));
  const idStr = new Map(rows.map((r) => [r.id, String(r.id)]));

  return Response.json({
    items: rows.map((c) => ({
      id: idStr.get(c.id)!,
      parentId: c.parentId ? idStr.get(c.parentId) || String(c.parentId) : null,
      content: c.content,
      author: nameMap.get(c.userId) || '诗友',
      isMine: c.userId === uid,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

/** 学习社区：发表评论（楼中楼：parentId 指向被回复评论；命中敏感词直接拒绝） */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  let pid: bigint;
  try {
    pid = BigInt(params.id);
  } catch {
    return Response.json({ error: 'id 非法' }, { status: 400 });
  }
  const post = await prisma.post.findUnique({ where: { id: pid }, select: { id: true, status: true } });
  if (!post) return Response.json({ error: '帖子不存在' }, { status: 404 });
  if (post.status !== 'approved') return Response.json({ error: '该帖子未通过审核，暂不可评论' }, { status: 403 });

  const { content, parentId } = (await req.json()) as { content?: string; parentId?: string };
  const text = content?.trim();
  if (!text || text.length > 500) return Response.json({ error: '评论需为 1-500 字' }, { status: 400 });

  const flagged = findSensitiveWords(text);
  if (flagged.length) return Response.json({ error: `评论包含敏感词：${flagged.join('、')}` }, { status: 400 });

  let parent: bigint | null = null;
  if (parentId) {
    try {
      const p = BigInt(parentId);
      const row = await prisma.comment.findUnique({ where: { id: p }, select: { id: true, postId: true } });
      if (!row || row.postId !== pid) return Response.json({ error: '被回复评论不存在' }, { status: 400 });
      parent = p;
    } catch {
      return Response.json({ error: 'parentId 非法' }, { status: 400 });
    }
  }

  const c = await prisma.comment.create({ data: { postId: pid, userId: uid, parentId: parent, content: text } });
  const me = await prisma.user.findUnique({ where: { id: uid }, select: { name: true } });
  return Response.json({
    id: String(c.id), parentId: parent ? String(parent) : null, content: c.content,
    author: me?.name || '诗友', isMine: true, createdAt: c.createdAt.toISOString(),
  });
}
