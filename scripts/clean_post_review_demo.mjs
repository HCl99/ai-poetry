/**
 * 清理 seed_post_review_demo.py 生成的演示帖子与对应审核记录。
 * 按 scripts/post_review_demo_data.json 里的标题精确匹配，不会误删真实用户帖子。
 *
 *     node scripts/clean_post_review_demo.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const dir = path.dirname(fileURLToPath(import.meta.url));
const demo = JSON.parse(readFileSync(path.join(dir, 'post_review_demo_data.json'), 'utf8'));
const titles = demo.map((x) => x.title);
const prisma = new PrismaClient();

try {
  const posts = await prisma.post.findMany({ where: { title: { in: titles } }, select: { id: true, title: true } });
  const ids = posts.map((p) => p.id);
  if (ids.length) {
    await prisma.comment.deleteMany({ where: { postId: { in: ids } } });
    await prisma.postLike.deleteMany({ where: { postId: { in: ids } } });
    await prisma.post.deleteMany({ where: { id: { in: ids } } });
  }
  const logs = await prisma.postReviewLog.deleteMany({ where: { postTitle: { in: titles } } });
  console.log(`已清理演示帖子 ${posts.length} 条、对应审核记录 ${logs.count} 条。`);
  posts.forEach((p) => console.log(`  - ${p.title}`));
} finally {
  await prisma.$disconnect();
}
