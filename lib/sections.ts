/**
 * AI 注解四维度分节解析（服务端 route 与客户端组件共用）。
 * 大模型按【小节名】纯文本流式输出，本模块在流式中途（可能只有半截标题/正文）
 * 与流结束后都能稳定切分，保证逐字渲染与最终结果一致。
 */

export interface SectionDef {
  key: 'zici' | 'diangu' | 'qinggan' | 'geli';
  /** 模型输出中使用的小节标题文字 */
  marker: string;
  /** 面向用户展示的标签 */
  tag: string;
}

export const ANNOTATION_SECTIONS: SectionDef[] = [
  { key: 'zici', marker: '字词释义', tag: '字词释义' },
  { key: 'diangu', marker: '典故溯源', tag: '典故溯源' },
  { key: 'qinggan', marker: '情感分析', tag: '情感分析' },
  { key: 'geli', marker: '格律分析', tag: '格律分析' },
];

export type SectionMap = Record<SectionDef['key'], string>;

export function emptySections(): SectionMap {
  return { zici: '', diangu: '', qinggan: '', geli: '' };
}

/**
 * 把带【小节名】标记的文本切分为四个维度的正文。
 * 容错：标题括号可为【】或[]，可有空白；模型漏标时未归属内容不强行猜测。
 */
export function parseAnnotationSections(text: string): SectionMap {
  const result = emptySections();
  if (!text) return result;

  // 匹配形如 【字词释义】 / [字词释义] 的小节标题
  const titleNames = ANNOTATION_SECTIONS.map((s) => s.marker).join('|');
  const re = new RegExp(`[【\\[]\\s*(${titleNames})\\s*[】\\]]`, 'g');

  const hits: { key: SectionDef['key']; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const def = ANNOTATION_SECTIONS.find((s) => s.marker === m![1]);
    if (def) hits.push({ key: def.key, start: m.index, end: m.index + m[0].length });
  }

  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i];
    const contentEnd = i + 1 < hits.length ? hits[i + 1].start : text.length;
    result[cur.key] = text.slice(cur.end, contentEnd).trim();
  }

  return result;
}

/**
 * 兜底：若四个小节全部为空但正文非空（模型未按格式输出），
 * 把整段清洗后归入「字词释义」，避免前端出现空白结果。
 */
export function withFallback(text: string, sections: SectionMap): SectionMap {
  const hasAny = (Object.values(sections) as string[]).some((v) => v.trim().length > 0);
  if (!hasAny && text.trim()) {
    return { ...sections, zici: text.replace(/[【\[]\s*[】\]]/g, '').trim() };
  }
  return sections;
}
