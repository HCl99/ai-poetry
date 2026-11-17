-- 可选：已有 MySQL 库同步「先审后发」默认值
--
-- 应用侧 POST /api/posts 显式写入 status（见 lib/postWorkflow.ts），
-- 因此不执行本脚本也不影响审核闭环功能。执行后可保证「绕过应用直接写库」
-- 的路径同样默认进入待审核队列，与 prisma/schema.prisma 保持一致。
--
-- 说明：不改任何已有数据行，历史已通过帖子保持原状。

ALTER TABLE `posts`
  MODIFY COLUMN `status` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/withdrawn';
