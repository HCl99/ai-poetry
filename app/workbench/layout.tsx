import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { WorkbenchShell } from '@/components/workbench/shell';

export const dynamic = 'force-dynamic';

export default async function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <WorkbenchShell user={{ id: session.user.id!, name: session.user.name, email: session.user.email }}>
      {children}
    </WorkbenchShell>
  );
}
