import { auth } from '@/auth';
import { getQueryCloud } from '@/lib/queryCloud';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

async function GET_impl() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const { words, total } = await getQueryCloud(60);
  return Response.json({ words, total });
}

export const GET = withApi(GET_impl);
