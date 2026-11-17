// 学习社区共享常量与工具

/** 社区帖子分类已改为管理端运行时维护，见 lib/postCategories.ts（此处不再保留编译期常量） */

/** 帖子状态（先审后发 + 作者撤回，状态机见 lib/postWorkflow.ts） */
export const POST_STATUS_LABEL: Record<string, string> = {
  approved: '已通过',
  pending: '待审核',
  rejected: '已拒绝',
  withdrawn: '已撤回',
};

/** 反馈类型 */
export const FEEDBACK_TYPES = ['功能异常', '功能建议', '内容纠错', '其他'] as const;

/**
 * 敏感词检测（本地词表，命中即转入人工审核队列，不做自动删除）
 * 返回命中的敏感词列表，空数组表示通过
 */
const SENSITIVE_WORDS = [
  '赌博', '博彩', '六合彩', '代开发票', '色情', '援交', '毒品', '冰毒',
  '枪支', '弹药', '诈骗', '洗钱', '传销', '刷单', '外挂', '私服',
  '办证', '代考', '翻墙', '邪教', '法轮', '分裂国家', '恐怖袭击',
];

export function findSensitiveWords(text: string): string[] {
  if (!text) return [];
  return SENSITIVE_WORDS.filter((w) => text.includes(w));
}
