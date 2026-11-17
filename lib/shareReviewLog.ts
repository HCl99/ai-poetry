import { prisma } from '@/lib/prisma';
import type { ReviewAction } from '@/lib/postReviewMeta';

/**
 * 作品广场分享审核记录 + 运行时表结构兜底。
 *
 * 评审环境可能只导入了旧版 data/ai_poetry.sql（creations 没有 share_* 列、
 * 也没有 creation_review_logs 表）。这里在首次读写时幂等补齐，避免要求评审
 * 额外执行迁移脚本；开发环境仍由 prisma db push 同步 schema。
 */

const CREATE_LOG_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS creation_review_logs (
  id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  creation_id    BIGINT       NOT NULL,
  creation_title VARCHAR(255) NOT NULL,
  action         VARCHAR(16)  NOT NULL,
  from_status    VARCHAR(16)  NULL,
  to_status      VARCHAR(16)  NULL,
  operator_id    CHAR(36)     NULL,
  operator_name  VARCHAR(64)  NOT NULL DEFAULT '系统',
  actor_role     VARCHAR(16)  NOT NULL DEFAULT 'system',
  note           VARCHAR(255) NULL,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_crl_creation (creation_id),
  INDEX idx_crl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const SHARE_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'share_status', ddl: "VARCHAR(16) NOT NULL DEFAULT 'private'" },
  { name: 'share_flag_reason', ddl: 'VARCHAR(255) NULL' },
  { name: 'share_review_note', ddl: 'VARCHAR(255) NULL' },
  { name: 'shared_at', ddl: 'DATETIME(3) NULL' },
  { name: 'reviewed_at', ddl: 'DATETIME(3) NULL' },
];

let schemaReady: Promise<void> | null = null;

async function ensureShareSchemaOnce(): Promise<void> {
  await prisma.$executeRawUnsafe(CREATE_LOG_TABLE_SQL);

  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'creations'",
  );
  const existing = new Set(rows.map((r) => r.name));
  for (const col of SHARE_COLUMNS) {
    if (!existing.has(col.name)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE creations ADD COLUMN ${col.name} ${col.ddl}`);
    }
  }

  // 老数据回填：原来 is_public=true 的作品视为已通过分享
  await prisma.$executeRawUnsafe(
    "UPDATE creations SET share_status = 'approved' WHERE is_public = 1 AND share_status = 'private'",
  );
}

/** 幂等补齐分享审核所需表/列，进程内只跑一次；失败允许下次请求重试 */
export function ensureShareSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = ensureShareSchemaOnce().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

export interface ShareReviewLogInput {
  creationId: bigint;
  creationTitle: string;
  action: ReviewAction;
  fromStatus?: string | null;
  toStatus?: string | null;
  operatorId?: string | null;
  operatorName?: string | null;
  actorRole?: 'admin' | 'user' | 'system';
  note?: string | null;
}

/** 写一条作品审核记录；留痕失败只打日志，不影响主流程 */
export async function writeShareReviewLog(input: ShareReviewLogInput): Promise<void> {
  try {
    await ensureShareSchema();
    await prisma.creationReviewLog.create({
      data: {
        creationId: input.creationId,
        creationTitle: input.creationTitle.slice(0, 255),
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
    console.error('[share-review-log] 写入作品审核记录失败:', (e as Error).message);
  }
}
