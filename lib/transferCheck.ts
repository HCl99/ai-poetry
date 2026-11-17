/**
 * 风格迁移的内容侧确定性校验（判据零）：
 * 模型会用「何事」凑二字句、照抄范例、把「加班」这类现代词写进词里、车轱辘话重复。
 * 纯函数、无外部依赖，便于单测。
 */

const FILLER = new Set(['何事', '还是', '为何', '何故', '如何', '何如', '为甚', '因何', '依旧', '且看', '何妨', '此时', '无限']);
const MODERN = ['加班', '上班', '下班', '手机', '电脑', '地铁', '公交', '公司', '老板', '打工', '微信', '视频', '空调', '高铁', '超市', '咖啡'];

/** 只保留汉字 */
export function stripNonHan(t: string): string {
  return t.replace(/[^\u4e00-\u9fff]/g, '');
}

export type ContentIssues = {
  /** 二字句用了无实义虚词（如「何事」） */
  fillerLine?: string;
  /** 现代词直接入诗词（如「加班」） */
  modernWord?: string;
  /** 照搬了原作范例的句子（二字顿句相同或连续 4 字相同） */
  copiedLine?: string;
  /** 完全相同的两句（车轱辘话） */
  dupLine?: string;
  /** 同一个二字词出现 3 次以上 */
  dupGram?: string;
};

/**
 * 对生成稿逐句做内容校验。
 * @param lines 生成稿正文各句（已剔除词牌名行）
 * @param exemplarSents 原作范例各句（用于查重防抄袭），可为空
 */
export function checkPoemContent(lines: string[], exemplarSents: string[] = []): ContentIssues {
  const strip = stripNonHan;
  const plains = lines.map(strip);

  const fillerLine = lines.find((l) => {
    const n = strip(l);
    return n.length > 0 && n.length <= 2 && FILLER.has(n);
  });

  const modernWord = MODERN.find((w) => plains.some((l) => l.includes(w)));

  // 同一个二字词全篇出现 3 次以上＝车轱辘话（如「加班」×3）
  const gramCount = new Map<string, number>();
  for (const l of plains) {
    for (let i = 0; i + 2 <= l.length; i++) {
      const g = l.slice(i, i + 2);
      gramCount.set(g, (gramCount.get(g) || 0) + 1);
    }
  }
  const dupGram = [...gramCount.entries()].find(([g, c]) => c >= 3 && !/^(.)\1$/.test(g))?.[0];

  const dupLine = plains.find((l, i) => l.length >= 5 && plains.indexOf(l) !== i);

  const exemplarText = exemplarSents.map(strip).join('');
  const copiedLine = exemplarText
    ? lines.find((l) => {
        const n = strip(l);
        // 二字顿句与原作相同即算照抄（「依旧」「看取」都是从范例里搬来的）
        if (n.length <= 2) return n.length === 2 && exemplarText.includes(n);
        // 长句看任意连续 4 字是否与原作相同
        for (let i = 0; i + 4 <= n.length; i++) {
          if (exemplarText.includes(n.slice(i, i + 4))) return true;
        }
        return false;
      })
    : undefined;

  return { fillerLine, modernWord, copiedLine, dupLine, dupGram };
}

/** 由内容校验结果生成注入下一轮的重写要求（用于反馈重写 prompt） */
export function rewriteReason(issues: ContentIssues): string {
  if (issues.fillerLine) {
    return `上一版用空泛虚词「${issues.fillerLine}」凑二字句式，必须改成实词动作（如「无寐」「推窗」）。`;
  }
  if (issues.modernWord) {
    return `上一版把现代词「${issues.modernWord}」直接写进词里，须换成本文意象的古典说法（如加班→夜值、未眠）。`;
  }
  if (issues.copiedLine) {
    return `上一版有句子照搬了原作范例（「${issues.copiedLine.trim()}」），必须完全原创。`;
  }
  if (issues.dupLine) {
    return `上一版有两句完全相同（「${issues.dupLine}」），句句都要新写。`;
  }
  if (issues.dupGram) {
    return `上一版把「${issues.dupGram}」这个词重复了 3 次以上，同一个词全篇最多 2 次，须换成不同景物。`;
  }
  return '';
}

/** 内容校验的 SSE 展示标签（按问题类型择一） */
export function contentIssueLabel(issues: ContentIssues): string {
  if (issues.modernWord) return '内容校验 · 现代词入词';
  if (issues.fillerLine) return '内容校验 · 二字句无实义';
  if (issues.dupGram) return '内容校验 · 用词重复';
  return '内容校验 · 照搬原作';
}
