import { describe, it, expect } from 'vitest';
import { STYLES, CIPAI_RE } from './transferStyles';

describe('STYLES 风格库完整性', () => {
  it('五个内置风格齐全', () => {
    expect(Object.keys(STYLES).sort()).toEqual(['dufu', 'libai', 'sushi', 'wangwei', 'wanyue']);
  });

  it('诗体风格无词牌，词体风格必有词牌与上下阕分界', () => {
    for (const [key, s] of Object.entries(STYLES)) {
      if (s.genre === '诗') {
        expect(s.cipai, `${key} 诗体不应有 cipai`).toBeUndefined();
        expect(s.blankAfter, `${key} 诗体不应有 blankAfter`).toBeUndefined();
        expect(new Set(s.shape).size === 1, `${key} 诗体各句等长`).toBe(true);
      } else {
        expect(s.cipai, `${key} 词体应有 cipai`).toBeTruthy();
        expect(s.blankAfter, `${key} 词体应有 blankAfter`).toBeGreaterThan(0);
        expect(s.blankAfter!, `${key} 上下阕分界应在句数范围内`).toBeLessThan(s.shape.length);
      }
    }
  });

  it('词牌名能被 CIPAI_RE 命中（用于库内筛词范例）', () => {
    for (const s of Object.values(STYLES)) {
      if (s.cipai) expect(CIPAI_RE.test(s.cipai), s.cipai).toBe(true);
    }
  });

  it('CIPAI_RE 不会误命中常见诗题', () => {
    expect(CIPAI_RE.test('静夜思')).toBe(false);
    expect(CIPAI_RE.test('春望')).toBe(false);
    expect(CIPAI_RE.test('水调歌头·明月几时有')).toBe(true);
  });
});
