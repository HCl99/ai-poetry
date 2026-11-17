/**
 * 帖子审核动作常量（前后端共享，纯常量、不依赖 Prisma，客户端可安全导入）。
 * 服务端写入见 lib/postReviewLog.ts。
 */

export const REVIEW_ACTION = {
  SUBMIT: 'submit',
  APPROVE: 'approve',
  REJECT: 'reject',
  TAKEDOWN: 'takedown',
  WITHDRAW: 'withdraw',
  DELETE: 'delete',
} as const;

export type ReviewAction = (typeof REVIEW_ACTION)[keyof typeof REVIEW_ACTION];

/** 动作文案与色板，与 components/admin/ui.tsx 的状态色一致 */
export const REVIEW_ACTION_META: Record<string, { label: string; color: string }> = {
  submit: { label: '提交投稿', color: '#7B8EA1' },
  approve: { label: '审核通过', color: '#6B8E7B' },
  reject: { label: '审核拒绝', color: '#C4A965' },
  takedown: { label: '管理员下架', color: '#C4A965' },
  withdraw: { label: '作者撤回', color: '#8B857A' },
  delete: { label: '删除记录', color: '#A67C7C' },
};

export const ACTOR_ROLE_LABEL: Record<string, string> = {
  admin: '管理员', user: '普通用户', system: '系统',
};
