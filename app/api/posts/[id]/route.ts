import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { POST_STATUS } from '@/lib/postWorkflow';
import { withApi } from '@/lib/apiHandler';
import { REVIEW_ACTION } from '@/lib/postReviewMeta';
import { writeReviewLog } from '@/lib/postReviewLog';

export const dynamic = 'force-dynamic';

/**
 * 学习社区：作者撤回自己的投稿。
 * 待审核、已通过、未通过三种状态都可撤回；撤回是用户侧终态，
 * 之后管理员也不能再次审批放出，只能由管理员删除记录。
 */
async function PUT_impl(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return Response.json({ error: '未登录' }, { status: 401 });

  let pid: bigint;
  try {
    pid = BigInt(params.id);
  } catch {
    return Response.json({ error: 'id 非法' }, { status: 400 });
  }

  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== 'withdraw') return Response.json({ error: '未知操作' }, { status: 400 });

  const post = await prisma.post.findUnique({
    where: { id: pid },
    select: { userId: true, status: true, title: true },
  });
  if (!post) return Response.json({ error: '帖子不存在' }, { status: 404 });
  // 归属校验：普通用户与管理员都只能撤回自己的投稿，不能代他人撤回
  if (post.userId !== uid) return Response.json({ error: '只能撤回自己的投稿' }, { status: 403 });
  if (post.status === POST_STATUS.WITHDRAWN) return Response.json({ error: '该投稿已撤回' }, { status: 409 });

  // 条件更新：与管理员审批并发时以先落库者为准，避免覆盖刚刚撤回的结果
  const r = await prisma.post.updateMany({
    where: { id: pid, userId: uid, status: { not: POST_STATUS.WITHDRAWN } },
    data: { status: POST_STATUS.WITHDRAWN },
  });
  if (r.count === 0) return Response.json({ error: '该投稿状态已变化，请刷新后重试' }, { status: 409 });

  await writeReviewLog({
    postId: pid, postTitle: post.title, action: REVIEW_ACTION.WITHDRAW,
    fromStatus: post.status, toStatus: POST_STATUS.WITHDRAWN,
    operatorId: uid,
    operatorName: session?.user?.name || session?.user?.email || '诗友',
    actorRole: session?.user?.role === 'admin' ? 'admin' : 'user',
  });
  return Response.json({ id: String(pid), status: POST_STATUS.WITHDRAWN });
}

export const PUT = withApi(PUT_impl);
