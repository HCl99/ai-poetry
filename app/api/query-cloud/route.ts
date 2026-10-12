import { auth } from '@/auth';
import { getQueryCloud } from '@/lib/queryCloud';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const { words, total } = await getQueryCloud(60);
  return Response.json({ words, total });
}
