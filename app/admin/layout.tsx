import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/shell';

export const dynamic = 'force-dynamic';

/** 管理后台布局：RBAC 守卫，非管理员重定向回工作台 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/workbench');

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email }}>
      {children}
    </AdminShell>
  );
}
