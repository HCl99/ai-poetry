import { describe, it, expect } from 'vitest';
import { checkPoemContent, rewriteReason, contentIssueLabel, stripNonHan } from './transferCheck';

describe('checkPoemContent 内容校验', () => {
  it('二字句使用无实义虚词 → fillerLine', () => {
    const r = checkPoemContent(['孤灯照客眠。', '何事', '推窗见月明。']);
    expect(r.fillerLine).toBe('何事');
    expect(contentIssueLabel(r)).toBe('内容校验 · 二字句无实义');
  });

  it('实词二字顿句不算 filler（谁怕/无寐）', () => {
    const r = checkPoemContent(['竹杖芒鞋轻胜马，', '谁怕', '一蓑烟雨任平生。']);
    expect(r.fillerLine).toBeUndefined();
  });

  it('现代词直接入诗词 → modernWord', () => {
    const r = checkPoemContent(['深夜加班未眠时，', '独对屏幕忆故知。']);
    expect(r.modernWord).toBe('加班');
    expect(contentIssueLabel(r)).toBe('内容校验 · 现代词入词');
  });

  it('同一个二字词出现 3 次以上 → dupGram（叠字除外）', () => {
    const r = checkPoemContent(['明月照高楼，', '明月落江头，', '明月伴人愁。']);
    expect(r.dupGram).toBe('明月');
    const r2 = checkPoemContent(['年年岁岁花相似，', '岁岁年年人不同。']);
    expect(r2.dupGram).toBeUndefined(); // 「年年」「岁岁」叠字不算
  });

  it('两句完全相同（≥5 字）→ dupLine', () => {
    const r = checkPoemContent(['孤灯照客眠。', '推窗见月明。', '推窗见月明。']);
    expect(r.dupLine).toBe('推窗见月明');
  });

  it('照搬原作范例：长句连续 4 字相同 → copiedLine', () => {
    const exemplar = ['莫听穿林打叶声，', '何妨吟啸且徐行。'];
    const r = checkPoemContent(['莫听穿林打叶声（改），'], exemplar);
    expect(r.copiedLine).toBeTruthy();
    expect(contentIssueLabel(r)).toBe('内容校验 · 照搬原作');
  });

  it('二字顿句与范例相同也算照抄', () => {
    const exemplar = ['谁怕'];
    const r = checkPoemContent(['风雨莫听声，', '谁怕', '徐行任此生。'], exemplar);
    expect(r.copiedLine).toBe('谁怕');
  });

  it('无范例时 copiedLine 恒为 undefined', () => {
    const r = checkPoemContent(['莫听穿林打叶声，']);
    expect(r.copiedLine).toBeUndefined();
  });

  it('合规稿件全部通过', () => {
    const r = checkPoemContent(['孤灯照客眠难稳，', '推窗见月忆乡关。', '夜值归来茶已冷，', '音书未至意阑珊。']);
    expect(r.fillerLine).toBeUndefined();
    expect(r.modernWord).toBeUndefined();
    expect(r.copiedLine).toBeUndefined();
    expect(r.dupLine).toBeUndefined();
    expect(r.dupGram).toBeUndefined();
  });
});

describe('rewriteReason 重写反馈', () => {
  it('按优先级生成对应重写要求', () => {
    expect(rewriteReason({ fillerLine: '何事' })).toContain('何事');
    expect(rewriteReason({ modernWord: '加班' })).toContain('加班');
    expect(rewriteReason({ copiedLine: '莫听穿林打叶声（改）' })).toContain('照搬');
    expect(rewriteReason({ dupLine: '推窗见月明' })).toContain('完全相同');
    expect(rewriteReason({ dupGram: '月如' })).toContain('月如');
    expect(rewriteReason({})).toBe('');
  });
});

describe('stripNonHan', () => {
  it('剔除标点与空白', () => {
    expect(stripNonHan('床前，明月光！')).toBe('床前明月光');
  });
});
