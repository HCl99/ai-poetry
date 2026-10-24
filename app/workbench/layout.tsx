import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { WorkbenchShell } from '@/components/workbench/shell';

export const dynamic = 'force-dynamic';

export default async function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // 未登录 / 会话已作废（改密重置、账号禁用）统一回登录页
  if (!session?.user?.id || session.user.role === 'disabled') redirect('/login');
  return (
    <WorkbenchShell user={{ id: session.user.id!, name: session.user.name, email: session.user.email, role: session.user.role, avatar: session.user.avatar }}>
      {children}
    </WorkbenchShell>
  );
}
