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
      // RBAC + 个人资料：登录时刻快照，后续每次请求实时刷新（改名/头像即时生效）
      if (token.id) {
        const row = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, status: true, avatar: true, name: true, passwordChangedAt: true },
        });
        if (row) {
          token.role = row.role;
          token.status = row.status;
          token.avatar = row.avatar;
          if (row.name) token.name = row.name;

          const pwdAt = row.passwordChangedAt?.getTime() ?? 0;
          if (user) {
            // 登录时刻快照：本次会话认可的密码版本
            token.pwdAt = pwdAt;
            token.invalid = false;
          } else if (typeof token.pwdAt === 'number' && pwdAt > token.pwdAt) {
            // 密码在会话签发后被修改/重置：旧 token 立即作废，强制重新登录
            token.invalid = true;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        // 会话作废（改密/重置密码/账号禁用）：清空 id，所有需要登录的接口与页面统一拒绝
        if (token.invalid || (token.status as string) === 'disabled') {
          session.user.id = '';
          session.user.role = 'disabled';
          return session;
        }
        session.user.id = token.id as string;
        session.user.role = (token.role as string) || 'user';
        session.user.avatar = (token.avatar as string | null) || null;
      }
      return session;
    },
  },
  session: { strategy: 'jwt' },
});
