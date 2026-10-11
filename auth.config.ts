import type { NextAuthConfig } from 'next-auth';

// Edge-compatible 配置（不含数据库操作，可用于 middleware）
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      // 只有 /profile 需要登录，其余页面公开访问
      if (nextUrl.pathname.startsWith('/profile') && !isLoggedIn) {
        return false;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
