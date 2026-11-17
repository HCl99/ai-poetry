import { describe, it, expect } from 'vitest';
import { toSentences, shapeOf, normalizePoem } from './poemShape';

describe('toSentences 拆句', () => {
  it('两句一行的语料正确拆为两句（七律 4 行 × 14 字 → 8 句）', () => {
    const lines = [
      '舍南舍北皆春水，但见群鸥日日来。',
      '花径不曾缘客扫，蓬门今始为君开。',
      '盘飧市远无兼味，樽酒家贫只旧醅。',
      '肯与邻翁相对饮，隔篱呼取尽馀杯。',
    ];
    const sents = toSentences(lines);
    expect(sents).toHaveLength(8);
    expect(sents[0]).toBe('舍南舍北皆春水，');
    expect(sents[7]).toBe('隔篱呼取尽馀杯。');
  });

  it('空行与空白行被剔除', () => {
    expect(toSentences(['床前明月光，', '', '  ', '疑是地上霜。'])).toHaveLength(2);
  });

  it('无标点的行作为整句保留', () => {
    expect(toSentences(['三五七言'])).toEqual(['三五七言']);
  });
});

describe('shapeOf 句式指纹', () => {
  it('剔除标点后逐句计数', () => {
    expect(shapeOf(['舍南舍北皆春水，', '但见群鸥日日来。'])).toBe('7,7');
  });

  it('二字顿句计为 2（定风波句式）', () => {
    expect(shapeOf(['莫听穿林打叶声，', '何妨吟啸且徐行。', '竹杖芒鞋轻胜马，', '谁怕', '一蓑烟雨任平生。'])).toBe('7,7,7,2,7');
  });
});

describe('normalizePoem 版式规整', () => {
  it('诗体：同一行内靠句末标点拆句，漏写行末标点按奇句逗/偶句句补齐', () => {
    const out = normalizePoem('床前明月光，疑是地上霜', { genre: '诗' });
    expect(out.split('\n')).toEqual(['床前明月光，', '疑是地上霜。']);
  });

  it('诗体：已有句末标点时不重复补', () => {
    const out = normalizePoem('床前明月光，\n疑是地上霜。', { genre: '诗' });
    expect(out.split('\n')).toEqual(['床前明月光，', '疑是地上霜。']);
  });

  it('词体：首行补词牌名，词牌与正文之间空一行', () => {
    const out = normalizePoem('一曲新愁酒一杯，\n去年天气旧亭台。', { genre: '词', cipai: '浣溪沙', blankAfter: 3 });
    const lines = out.split('\n');
    expect(lines[0]).toBe('浣溪沙');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('一曲新愁酒一杯，');
  });

  it('词体：模型已写出词牌名时不重复插入（去重后补一次）', () => {
    const out = normalizePoem('《浣溪沙》\n一曲新愁酒一杯。', { genre: '词', cipai: '浣溪沙' });
    const lines = out.split('\n');
    expect(lines.filter((l) => l === '浣溪沙')).toHaveLength(1);
  });

  it('词体：上下阕之间在 blankAfter 位置留空行', () => {
    const sents = ['莫听穿林打叶声，', '何妨吟啸且徐行。', '竹杖芒鞋轻胜马，', '谁怕', '一蓑烟雨任平生。', '料峭春风吹酒醒，', '微冷', '山头斜照却相迎。', '回首向来萧瑟处，', '归去', '也无风雨也无晴。'];
    const out = normalizePoem(sents.join('\n'), { genre: '词', cipai: '定风波', blankAfter: 5 });
    const lines = out.split('\n');
    expect(lines[0]).toBe('定风波');
    // 词牌(0) 空行(1) 正文 2..6，第 7 行应为上下阕分界空行
    expect(lines[7]).toBe('');
    expect(lines[6]).toBe('一蓑烟雨任平生。');
    expect(lines[8]).toBe('料峭春风吹酒醒，');
  });
});
