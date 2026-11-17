-- 可选：帖子审核记录表（操作历史）
--
-- 应用侧 lib/postReviewLog.ts 的 ensureReviewLogTable() 会在首次读写时
-- 用 CREATE TABLE IF NOT EXISTS 自动建表，因此**不执行本脚本也能跑通**，
-- 包括评审环境只导入旧版 ai_poetry.sql 的情况。
-- 本脚本供 DBA 预先建表 / 审阅表结构时使用。
--
-- 说明：不设指向 posts 的外键，帖子被管理员删除后其审核历史仍要可追溯；
--       post_title / operator_name 为冗余快照，避免联表时因记录消失而显示空白。

CREATE TABLE IF NOT EXISTS post_review_logs (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id       BIGINT       NOT NULL,
  post_title    VARCHAR(255) NOT NULL,
  action        VARCHAR(16)  NOT NULL,           -- submit/approve/reject/withdraw/delete
  from_status   VARCHAR(16)  NULL,
  to_status     VARCHAR(16)  NULL,
  operator_id   CHAR(36)     NULL,
  operator_name VARCHAR(64)  NOT NULL DEFAULT '系统',
  actor_role    VARCHAR(16)  NOT NULL DEFAULT 'system',  -- admin/user/system
  note          VARCHAR(255) NULL,              -- 审核备注 / 敏感词标记原因
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prl_post (post_id),
  INDEX idx_prl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
