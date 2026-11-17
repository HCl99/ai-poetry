import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

async function GET_impl() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const uid = session.user.id;
  const [favorites, history, creations, notes] = await Promise.all([
    prisma.favorite.count({ where: { userId: uid } }),
    prisma.history.count({ where: { userId: uid } }),
    prisma.creation.count({ where: { userId: uid } }),
    prisma.note.count({ where: { userId: uid } }),
  ]);
  return Response.json({ favorites, history, creations, notes });
}

export const GET = withApi(GET_impl);
