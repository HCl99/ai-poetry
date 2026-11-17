import { prisma } from '@/lib/prisma';
import type { ReviewAction } from '@/lib/postReviewMeta';

/**
 * 帖子审核记录（需求文档 3.2.15「审核记录：记录审核历史」）。
 *
 * 覆盖帖子全生命周期：用户投稿 / 管理员通过 / 管理员拒绝 / 作者撤回 / 管理员删除。
 * 每条记录冗余保存帖子标题与操作人名称，帖子被删除后历史仍可读，因此不设外键。
 *
 * 评审环境若只导入旧版 sql（没有本表），首次读写时 ensureReviewLogTable()
 * 会幂等建表，不需要额外执行迁移脚本。
 * 共享常量放在 lib/postReviewMeta.ts，供客户端组件安全导入。
 */

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS post_review_logs (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id       BIGINT       NOT NULL,
  post_title    VARCHAR(255) NOT NULL,
  action        VARCHAR(16)  NOT NULL,
  from_status   VARCHAR(16)  NULL,
  to_status     VARCHAR(16)  NULL,
  operator_id   CHAR(36)     NULL,
  operator_name VARCHAR(64)  NOT NULL DEFAULT '系统',
  actor_role    VARCHAR(16)  NOT NULL DEFAULT 'system',
  note          VARCHAR(255) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prl_post (post_id),
  INDEX idx_prl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

let tableReady: Promise<void> | null = null;

/** 幂等建表，进程内只跑一次；失败时允许下次请求重试 */
export function ensureReviewLogTable(): Promise<void> {
  if (!tableReady) {
    tableReady = prisma.$executeRawUnsafe(CREATE_TABLE_SQL)
      .then(() => undefined)
      .catch((e) => {
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

export interface ReviewLogInput {
  postId: bigint;
  postTitle: string;
  action: ReviewAction;
  fromStatus?: string | null;
  toStatus?: string | null;
  operatorId?: string | null;
  operatorName?: string | null;
  actorRole?: 'admin' | 'user' | 'system';
  note?: string | null;
}

/**
 * 写一条审核记录。留痕失败只记服务端日志、不抛给调用方：
 * 帖子状态已经落库，不能因为日志表异常让用户的发帖/审批操作失败。
 */
export async function writeReviewLog(input: ReviewLogInput): Promise<void> {
  try {
    await ensureReviewLogTable();
    await prisma.postReviewLog.create({
      data: {
        postId: input.postId,
        postTitle: input.postTitle.slice(0, 255),
        action: input.action,
        fromStatus: input.fromStatus || null,
        toStatus: input.toStatus || null,
        operatorId: input.operatorId || null,
        operatorName: (input.operatorName || '系统').slice(0, 64),
        actorRole: input.actorRole || 'system',
        note: input.note ? input.note.slice(0, 255) : null,
      },
    });
  } catch (e) {
    console.error('[review-log] 写入审核记录失败:', (e as Error).message);
  }
}
