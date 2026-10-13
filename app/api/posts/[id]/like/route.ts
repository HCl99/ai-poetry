import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** 学习社区：帖子点赞/取消赞（一人一赞） */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
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
  if (post.status !== 'approved') return Response.json({ error: '该帖子未通过审核' }, { status: 403 });

  const liked = await prisma.postLike.findUnique({
    where: { postId_userId: { postId: pid, userId: uid } },
  });
  if (liked) {
    await prisma.postLike.delete({ where: { id: liked.id } });
  } else {
    await prisma.postLike.create({ data: { postId: pid, userId: uid } });
  }
  const likes = await prisma.postLike.count({ where: { postId: pid } });
  return Response.json({ likedByMe: !liked, likes });
}
