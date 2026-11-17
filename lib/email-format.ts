/**
 * 邮箱格式校验（前后端共用）：
 * 1. 通用格式：本地部分 + 域名 + 至少 2 位顶级域，拒绝 a@b、a@b.c. 这类写法
 * 2. 常见域名笔误：1111@qq.co 这类「格式合法但几乎一定输错」的地址直接拦截，
 *    避免把验证码发往不存在的邮箱，用户却以为已经发出
 */
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** 常见邮箱服务商（仅这些域名做笔误纠正，不影响其他合法自定义域名） */
const PROVIDERS = ['qq', 'foxmail', '163', '126', 'sina', 'gmail', 'outlook', 'hotmail', '139', 'sohu', 'aliyun', 'yeah'];

/** 易被误当作 .com 的后缀 */
const TYPO_TLDS = ['co', 'con', 'cm', 'om', 'cpm', 'vom', 'xom', 'cn'];

/** 返回错误文案；格式合法返回 null */
export function checkEmailFormat(email: string): string | null {
  if (!EMAIL_RE.test(email)) return '邮箱格式不正确';
  const domain = email.split('@')[1] || '';
  const m = domain.match(/^([a-z0-9-]+)\.([a-z]+)$/);
  if (m && PROVIDERS.includes(m[1]) && TYPO_TLDS.includes(m[2])) {
    return `邮箱域名疑似笔误，${m[1]} 邮箱应为 @${m[1]}.com`;
  }
  return null;
}
