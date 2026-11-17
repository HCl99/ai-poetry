/**
 * 作品广场分享状态机（前后端共享，纯函数便于单测）。
 *
 *   private ──发布──> pending ──管理员通过──> approved ──管理员下架──> rejected
 *                        └──管理员拒绝──> rejected ──作者重新发布──> pending
 *   pending / approved / rejected ──作者撤回──> withdrawn ──重新发布──> pending
 *
 * 与帖子一致：撤回优先，管理员审批走条件更新；已撤回的作品不会被重新放出。
 */

export const SHARE_STATUS = {
  PRIVATE: 'private',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
} as const;

export type ShareStatus = (typeof SHARE_STATUS)[keyof typeof SHARE_STATUS];

/** 管理后台可筛选的状态白名单（private 不展示） */
export const SHARE_STATUS_FILTERS: ShareStatus[] = [
  SHARE_STATUS.PENDING,
  SHARE_STATUS.APPROVED,
  SHARE_STATUS.REJECTED,
  SHARE_STATUS.WITHDRAWN,
];

export const SHARE_STATUS_LABEL: Record<string, string> = {
  private: '未分享',
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  withdrawn: '已撤回',
};

export function isShareStatus(v: string): v is ShareStatus {
  return SHARE_STATUS_FILTERS.includes(v as ShareStatus);
}

/** 发布初始状态：普通用户先审后发；管理员正常内容免审；命中敏感词一律送审 */
export function initialShareStatus(role: string | undefined, sensitiveHit: boolean): ShareStatus {
  if (sensitiveHit) return SHARE_STATUS.PENDING;
  return role === 'admin' ? SHARE_STATUS.APPROVED : SHARE_STATUS.PENDING;
}

/** 只有未分享 / 被拒绝 / 已撤回的作品可以再次发布 */
export function canPublishShare(status: string): boolean {
  return status === SHARE_STATUS.PRIVATE
    || status === SHARE_STATUS.REJECTED
    || status === SHARE_STATUS.WITHDRAWN;
}

/** 作者可撤回：待审、已发布、被拒绝都能撤回；已撤回不可重复撤回 */
export function canWithdrawShare(status: string, isMine: boolean): boolean {
  return isMine
    && (status === SHARE_STATUS.PENDING
      || status === SHARE_STATUS.APPROVED
      || status === SHARE_STATUS.REJECTED);
}

/** 是否出现在分享广场 */
export function isShareVisible(status: string): boolean {
  return status === SHARE_STATUS.APPROVED;
}

/** 作品在审核列表/日志里的标题：风格 + 正文首段截断 */
export function shareTitle(style: string, outputText: string): string {
  const first = outputText.replace(/\s+/g, ' ').trim();
  return `${style} · ${first.slice(0, 40)}${first.length > 40 ? '…' : ''}`;
}

/** 用户侧状态横幅（仅非公开状态展示） */
export function shareStatusBanner(status: string): { title: string; hint: string; color: string; bg: string } | null {
  switch (status) {
    case SHARE_STATUS.PENDING:
      return {
        title: '管理员审批中 · 仅自己可见',
        hint: '通过后会自动出现在分享广场；期间可随时撤回。',
        color: '#C4A965', bg: 'rgba(196,169,101,0.12)',
      };
    case SHARE_STATUS.REJECTED:
      return {
        title: '分享未通过 · 仅自己可见',
        hint: '可参考审核备注后重新发布，或撤回这条分享。',
        color: '#A67C7C', bg: 'rgba(166,124,124,0.12)',
      };
    case SHARE_STATUS.WITHDRAWN:
      return {
        title: '已撤回 · 仅自己可见',
        hint: '这条作品已从广场移除，管理员也无法再次放出；可随时重新发布。',
        color: '#8B857A', bg: 'rgba(139,133,122,0.12)',
      };
    default:
      return null;
  }
}

/** 轮询发现自己的分享状态变化时给用户的一句话提示 */
export function shareChangeNotice(title: string, prev: string, next: string, note?: string | null): string | null {
  if (prev === next) return null;
  const suffix = note ? `：${note}` : '';
  if (next === SHARE_STATUS.APPROVED) {
    return prev === SHARE_STATUS.PENDING ? `《${title}》分享审核通过，已发布到广场` : `《${title}》已重新通过审核`;
  }
  if (next === SHARE_STATUS.REJECTED) {
    return prev === SHARE_STATUS.APPROVED ? `《${title}》已被管理员下架${suffix}` : `《${title}》分享未通过审核${suffix}`;
  }
  return null;
}
