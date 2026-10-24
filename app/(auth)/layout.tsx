import { prisma } from '@/lib/prisma';
import { AuthSplit } from '@/components/auth-split';

/**
 * 登录/注册共享壳（路由组 layout）：
 * 两页切换时品牌区与水墨背景保持挂载不重建（共享元素过渡），仅卡片内容随路由替换侧滑淡入；
 * 统计数据（真实诗篇总数）在此统一查询一次，避免两页重复请求。
 * 每日一诗：按当日日期对总数取模确定性取签（orderBy id 稳定），同日内全站一致，次日轮换。
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const totalPoems = await prisma.poem.count();

  let daily: { line: string; author: string; dynasty: string; title: string } | null = null;
  if (totalPoems > 0) {
    const dayIndex = Math.floor(Date.now() / 86400000) % totalPoems;
    const row = await prisma.poem.findFirst({
      skip: dayIndex,
      orderBy: { id: 'asc' },
      select: { title: true, author: true, dynasty: true, paragraphs: true, paragraphsSimp: true },
    });
    if (row) {
      const arr = (row.paragraphsSimp ?? row.paragraphs) as unknown;
      const first = Array.isArray(arr) ? arr.find((s): s is string => typeof s === 'string' && s.trim().length > 0) : null;
      if (first) {
        daily = {
          line: first.length > 40 ? `${first.slice(0, 40)}…` : first,
          author: row.author,
          dynasty: row.dynasty,
          title: row.title,
        };
      }
    }
  }

  return (
    <AuthSplit totalPoems={totalPoems} daily={daily}>
      {children}
    </AuthSplit>
  );
}
