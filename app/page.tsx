import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Landing } from '@/components/landing';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await auth();
  const totalPoems = await prisma.poem.count();
  return <Landing isLoggedIn={!!session?.user} userName={session?.user?.name ?? null} totalPoems={totalPoems} />;
}
