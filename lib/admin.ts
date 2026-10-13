import { auth } from '@/auth';

/**
 * 管理后台 RBAC 守卫：
 * - adminGuarded()：页面级守卫，非管理员返回 null（由页面 redirect）
 * - requireAdmin()：API 级守卫，返回 session 或 null（由路由 403）
 * 会话 role 由 auth.ts jwt 回调实时查库维护，禁用用户 role 置为 'disabled'。
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== 'admin') return null;
  return session;
}

export async function adminGuarded() {
  return requireAdmin();
}
