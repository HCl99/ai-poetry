import { auth } from '@/auth';
import { getPostCategories } from '@/lib/postCategories';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

/** 学习社区：读取当前启用的帖子分类（管理端改动后用户端立即生效） */
async function GET_impl() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  return Response.json({ items: await getPostCategories() });
}

export const GET = withApi(GET_impl);
