import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';
import { prisma } from '@/lib/prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // RBAC：被禁用账号拒绝登录（login action 捕获 ACCOUNT_DISABLED 转友好提示）
        if (user.status === 'disabled') throw new Error('ACCOUNT_DISABLED');

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      // RBAC：登录时刻快照角色；admin 授权变更后重新登录生效
      if (token.id) {
        const row = await prisma.user.findUnique({ where: { id: token.id as string }, select: { role: true, status: true } });
        if (row) {
          token.role = row.role;
          token.status = row.status;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) || 'user';
        // 已禁用用户的会话立即失效
        if ((token.status as string) === 'disabled') session.user.role = 'disabled';
      }
      return session;
    },
  },
  session: { strategy: 'jwt' },
});
