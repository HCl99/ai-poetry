import { describe, expect, it } from 'vitest';
import {
  POST_STATUS, POST_STATUS_FILTERS, canReview, canWithdraw,
  initialPostStatus, isPostStatus, isPubliclyVisible, postStatusBanner,
  reviewChangeNotice, reviewTarget, withdrawLabel,
} from '../postWorkflow';

describe('发帖初始状态：一律先审后发', () => {
  it('普通用户正常内容进入待审', () => {
    expect(initialPostStatus('user', false)).toBe(POST_STATUS.PENDING);
  });

  it('未登录/未知角色也按普通用户处理', () => {
    expect(initialPostStatus(undefined, false)).toBe(POST_STATUS.PENDING);
  });

  it('管理员发布正常内容免审', () => {
    expect(initialPostStatus('admin', false)).toBe(POST_STATUS.APPROVED);
  });

  it('命中敏感词时管理员也必须送审', () => {
    expect(initialPostStatus('admin', true)).toBe(POST_STATUS.PENDING);
  });

  it('被禁用角色不具备免审特权', () => {
    expect(initialPostStatus('disabled', false)).toBe(POST_STATUS.PENDING);
  });
});

describe('作者撤回权', () => {
  it('本人可撤回待审、已通过、未通过三种状态', () => {
    for (const s of [POST_STATUS.PENDING, POST_STATUS.APPROVED, POST_STATUS.REJECTED]) {
      expect(canWithdraw(s, true)).toBe(true);
    }
  });

  it('他人帖子不可撤回', () => {
    expect(canWithdraw(POST_STATUS.PENDING, false)).toBe(false);
    expect(canWithdraw(POST_STATUS.APPROVED, false)).toBe(false);
  });

  it('已撤回不可重复撤回', () => {
    expect(canWithdraw(POST_STATUS.WITHDRAWN, true)).toBe(false);
  });

  it('撤回按钮文案随状态变化', () => {
    expect(withdrawLabel(POST_STATUS.PENDING)).toBe('撤回申请');
    expect(withdrawLabel(POST_STATUS.APPROVED)).toBe('撤回帖子');
    expect(withdrawLabel(POST_STATUS.REJECTED)).toBe('撤回投稿');
  });
});

describe('管理员审批边界', () => {
  it('撤回是终态，不可再审批', () => {
    expect(canReview(POST_STATUS.WITHDRAWN)).toBe(false);
    expect(canReview(POST_STATUS.PENDING)).toBe(true);
    expect(canReview(POST_STATUS.REJECTED)).toBe(true);
  });

  it('通过/拒绝映射到目标状态', () => {
    expect(reviewTarget('approve')).toBe(POST_STATUS.APPROVED);
    expect(reviewTarget('reject')).toBe(POST_STATUS.REJECTED);
  });

  it('只有已通过帖子对社区可见', () => {
    expect(isPubliclyVisible(POST_STATUS.APPROVED)).toBe(true);
    for (const s of [POST_STATUS.PENDING, POST_STATUS.REJECTED, POST_STATUS.WITHDRAWN]) {
      expect(isPubliclyVisible(s)).toBe(false);
    }
  });
});

describe('状态筛选白名单', () => {
  it('四种合法状态全部覆盖', () => {
    expect(POST_STATUS_FILTERS).toEqual(['pending', 'approved', 'rejected', 'withdrawn']);
  });

  it('非法取值被拒绝，防止返回全表', () => {
    expect(isPostStatus('all')).toBe(false);
    expect(isPostStatus('')).toBe(false);
    expect(isPostStatus('PENDING')).toBe(false);
  });
});

describe('用户侧提示', () => {
  it('仅非公开状态显示横幅', () => {
    expect(postStatusBanner(POST_STATUS.APPROVED)).toBeNull();
    expect(postStatusBanner(POST_STATUS.PENDING)?.title).toContain('管理员审批中');
    expect(postStatusBanner(POST_STATUS.WITHDRAWN)?.title).toContain('已撤回');
  });

  it('待审通过时给出成功提示', () => {
    expect(reviewChangeNotice('春望', POST_STATUS.PENDING, POST_STATUS.APPROVED)).toContain('审核通过');
  });

  it('拒绝时带上审核备注', () => {
    expect(reviewChangeNotice('春望', POST_STATUS.PENDING, POST_STATUS.REJECTED, '内容重复')).toContain('内容重复');
  });

  it('状态未变化不打扰用户', () => {
    expect(reviewChangeNotice('春望', POST_STATUS.PENDING, POST_STATUS.PENDING)).toBeNull();
  });
});
