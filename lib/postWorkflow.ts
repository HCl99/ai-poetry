/**
 * 学习社区帖子状态机（前后端共享，纯函数便于单测）。
 *
 *   pending ──管理员通过──> approved
 *      │  └───管理员拒绝──> rejected ──复审通过──> approved
 *      └── 作者撤回 ─────> withdrawn（终态）
 *   approved / rejected 亦可由作者随时撤回；withdrawn 不接受再次审批，管理员只能删除。
 *
 * 撤回优先：管理员审批走条件更新（status != 'withdrawn'），与用户撤回并发时
 * 以先落库者为准，保证「已撤回的帖子不会被重新放出」。
 */

export const POST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
} as const;

export type PostStatus = (typeof POST_STATUS)[keyof typeof POST_STATUS];

/** 管理后台可按状态筛选的白名单，非法值一律回落到 pending，避免返回全表 */
export const POST_STATUS_FILTERS: PostStatus[] = [
  POST_STATUS.PENDING,
  POST_STATUS.APPROVED,
  POST_STATUS.REJECTED,
  POST_STATUS.WITHDRAWN,
];

export function isPostStatus(v: string): v is PostStatus {
  return POST_STATUS_FILTERS.includes(v as PostStatus);
}

/**
 * 发帖初始状态：一律先审后发。
 * 例外：命中敏感词时包括管理员在内都必须送审；管理员发布正常内容免审（角色差异）。
 */
export function initialPostStatus(role: string | undefined, sensitiveHit: boolean): PostStatus {
  if (sensitiveHit) return POST_STATUS.PENDING;
  return role === 'admin' ? POST_STATUS.APPROVED : POST_STATUS.PENDING;
}

/** 仅作者本人能撤回，且已撤回的帖子不可重复撤回 */
export function canWithdraw(status: string, isMine: boolean): boolean {
  return isMine && status !== POST_STATUS.WITHDRAWN;
}

/** 管理员是否还能审批：撤回是用户侧的终态权力 */
export function canReview(status: string): boolean {
  return status !== POST_STATUS.WITHDRAWN;
}

/** 是否对全体社区成员可见 */
export function isPubliclyVisible(status: string): boolean {
  return status === POST_STATUS.APPROVED;
}

/** 管理员通过 / 拒绝动作对应的目标状态 */
export function reviewTarget(action: 'approve' | 'reject'): PostStatus {
  return action === 'approve' ? POST_STATUS.APPROVED : POST_STATUS.REJECTED;
}

/** 撤回按钮文案：待审时是撤回申请，发布后是撤回帖子 */
export function withdrawLabel(status: string): string {
  if (status === POST_STATUS.PENDING) return '撤回申请';
  if (status === POST_STATUS.REJECTED) return '撤回投稿';
  return '撤回帖子';
}

/** 用户侧状态横幅（仅非公开状态展示），颜色沿用管理后台状态色板 */
export function postStatusBanner(status: string): { title: string; hint: string; color: string; bg: string } | null {
  switch (status) {
    case POST_STATUS.PENDING:
      return {
        title: '管理员审批中 · 仅自己可见',
        hint: '提交成功，管理员通过后会自动发布到学习社区；期间可随时撤回申请。',
        color: '#C4A965', bg: 'rgba(196,169,101,0.12)',
      };
    case POST_STATUS.REJECTED:
      return {
        title: '审核未通过 · 仅自己可见',
        hint: '可参考审核备注修改后重新发帖，也可撤回这条投稿。',
        color: '#A67C7C', bg: 'rgba(166,124,124,0.12)',
      };
    case POST_STATUS.WITHDRAWN:
      return {
        title: '已撤回 · 仅自己可见',
        hint: '这条投稿已从社区移除，管理员也无法再次将其审批放出。',
        color: '#8B857A', bg: 'rgba(139,133,122,0.12)',
      };
    default:
      return null;
  }
}

/** 轮询发现自己的帖子状态变化时给用户的一句话提示 */
export function reviewChangeNotice(title: string, prev: string, next: string, reviewNote?: string | null): string | null {
  if (prev === next) return null;
  const suffix = reviewNote ? `：${reviewNote}` : '';
  if (next === POST_STATUS.APPROVED) {
    return prev === POST_STATUS.PENDING ? `《${title}》审核通过，已发布到学习社区` : `《${title}》已重新通过审核`;
  }
  if (next === POST_STATUS.REJECTED) {
    return prev === POST_STATUS.PENDING ? `《${title}》未通过审核${suffix}` : `《${title}》已被管理员下架${suffix}`;
  }
  return null;
}
