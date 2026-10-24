/**
 * 内容安全过滤：输入侧（含 prompt injection 判定）与输出侧（同规则、不含 injection）双向防护。
 * 词库集中在服务端，不在 UI 暴露；规则按「明确违规语境」匹配，
 * 「杀人」「血」「死」「酒」「妓」等古诗词常见单字不做单独拦截。
 */

export type ViolationCategory = 'injection' | 'porn' | 'violence' | 'hate' | 'illegal';

export type ScreenResult =
  | { ok: true }
  | { ok: false; reason: string; category: ViolationCategory };

/** 违规兜底话术（流式输出中断时回传） */
export const SAFE_REPLY = '该内容未通过安全校验，已停止生成。请换一个与古诗词相关的表达。';

const REASONS: Record<ViolationCategory, string> = {
  injection: '输入包含试图绕过或改写系统指令的内容，请围绕古诗词提问。',
  porn: '输入包含色情低俗内容，请换一个与古诗词相关的表达。',
  violence: '输入包含血腥暴力内容，请换一个与古诗词相关的表达。',
  hate: '输入包含仇恨歧视内容，请换一个与古诗词相关的表达。',
  illegal: '输入包含违法交易或危险行为内容，请换一个与古诗词相关的表达。',
};

/** 内容违规规则（输出侧同样适用） */
const CONTENT_RULES: { category: Exclude<ViolationCategory, 'injection'>; patterns: RegExp[] }[] = [
  {
    category: 'porn',
    patterns: [
      /色情|情色|成人视频|黄色网站|裸聊|裸体|全裸|性行为|性交|做爱|约炮|嫖娼|卖淫|淫秽|强奸|轮奸/i,
    ],
  },
  {
    category: 'violence',
    patterns: [/血腥|虐杀|分尸|肢解|砍死|枪杀|爆头|活埋|割喉|断肢/i],
  },
  {
    category: 'hate',
    patterns: [/劣等民族|种族歧视|种族清洗|种族灭绝|仇恨言论|地域黑|黑鬼|支那|小日本/i],
  },
  {
    category: 'illegal',
    patterns: [
      /毒品|冰毒|海洛因|摇头丸|制毒|贩毒|吸毒|枪支弹药|买枪|卖枪|炸弹制作|制作炸弹|爆炸物|洗钱|赌博网站|网络赌博|办假证|假身份证|代开发票/i,
    ],
  },
];

/** 提示词注入 / 越狱规则（仅输入侧） */
const INJECTION_RULES: RegExp[] = [
  /(忽略|无视|忘掉|忘记|抛开|跳过).{0,10}(指令|提示词|提示|规则|设定|要求|限制|约束|prompt)/i,
  /(ignore|disregard|forget|override)\s*(all\s*)?(the\s*)?(previous|prior|above|earlier|system)\s*(instructions?|prompts?|rules?|messages?)/i,
  /(system\s*prompt|系统提示词|系统指令|隐藏指令)/i,
  /(开发者|开发人员|调试|上帝|DAN|超级)模式/i,
  /(jailbreak|越狱|绕过(安全|内容|审核|限制|规则)|解除(限制|约束)|不受任何限制)/i,
  /你现在是|从现在(起|开始)(你)?(就)?(是|扮演|充当)/,
  /(假装|扮演)(一个)?(没有|不受)(限制|约束|审查)的/,
  /(泄露|输出|告诉我|打印).{0,6}(系统提示|system\s*prompt|密钥|api\s*key|环境变量)/i,
];

/** 归一化：去掉空白并转小写，避免用空格拆分关键词绕过 */
function normalize(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

function match(text: string, includeInjection: boolean): ScreenResult {
  if (!text) return { ok: true };
  const s = normalize(text);
  if (includeInjection && INJECTION_RULES.some((re) => re.test(s))) {
    return { ok: false, reason: REASONS.injection, category: 'injection' };
  }
  for (const rule of CONTENT_RULES) {
    if (rule.patterns.some((re) => re.test(s))) {
      return { ok: false, reason: REASONS[rule.category], category: rule.category };
    }
  }
  return { ok: true };
}

/** 用户输入过滤：内容违规 + 提示词注入 / 越狱 */
export function screenInput(text: string): ScreenResult {
  return match(text, true);
}

/** 模型输出过滤：内容违规（额外不做 injection 判定） */
export function screenOutput(text: string): ScreenResult {
  return match(text, false);
}

/**
 * 流式输出守卫：累积最近 2000 字并逐段校验。
 * push 返回 false 表示命中违规，调用方应立即停止生成、发送兜底事件并结束流。
 */
export function createOutputGuard(): { push(delta: string): boolean; text(): string } {
  let buffer = '';
  return {
    push(delta: string): boolean {
      if (!delta) return true;
      buffer = (buffer + delta).slice(-2000);
      return screenOutput(buffer).ok;
    },
    text(): string {
      return buffer;
    },
  };
}
