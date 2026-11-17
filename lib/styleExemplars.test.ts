import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { poem: { findMany: vi.fn() } },
}));
vi.mock('@/lib/embedding', () => ({ embedText: vi.fn() }));
vi.mock('@/lib/vectorStore', () => ({ topKSimilar: vi.fn() }));
vi.mock('@/lib/reranker', () => ({ rerankTopN: vi.fn() }));

import { retrieveStyleExemplars } from './styleExemplars';
import { prisma } from '@/lib/prisma';
import { embedText } from '@/lib/embedding';
import { topKSimilar } from '@/lib/vectorStore';
import { rerankTopN } from '@/lib/reranker';
import { STYLES } from './transferStyles';

const mocked = {
  findMany: vi.mocked(prisma.poem.findMany),
  embedText: vi.mocked(embedText),
  topKSimilar: vi.mocked(topKSimilar),
  rerankTopN: vi.mocked(rerankTopN),
};

// 定风波原作（两句一行存储），句式指纹 7,7,7,2,7,7,2,7,7,2,7
// 注意：二字顿句须带句末标点，否则拆句时会与后句粘连成 9 字句
const DINGFENGBO_LINES = [
  '莫听穿林打叶声，何妨吟啸且徐行。',
  '竹杖芒鞋轻胜马，谁怕。一蓑烟雨任平生。',
  '料峭春风吹酒醒，微冷。山头斜照却相迎。',
  '回首向来萧瑟处，归去。也无风雨也无晴。',
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('retrieveStyleExemplars 检索编排', () => {
  it('向量服务不可用时返回空范例，不查库', async () => {
    mocked.embedText.mockResolvedValue(null as any);
    const r = await retrieveStyleExemplars('深夜独坐', STYLES.sushi);
    expect(r).toEqual({ exemplars: [], rerankApplied: false });
    expect(mocked.findMany).not.toHaveBeenCalled();
  });

  it('粗排未命中时返回空范例', async () => {
    mocked.embedText.mockResolvedValue([0.1, 0.2] as any);
    mocked.topKSimilar.mockResolvedValue([]);
    const r = await retrieveStyleExemplars('深夜独坐', STYLES.sushi);
    expect(r.exemplars).toEqual([]);
    expect(r.rerankApplied).toBe(false);
  });

  it('只保留句式与目标体裁完全一致的范例（reranker 不可用时降级粗排 top3）', async () => {
    mocked.embedText.mockResolvedValue([0.1, 0.2] as any);
    mocked.topKSimilar.mockResolvedValue([
      { id: 'p1', title: '定风波', score: 0.9 },
      { id: 'p2', title: '浣溪沙', score: 0.8 }, // 句式不符，应被过滤
    ] as any);
    mocked.findMany.mockResolvedValue([
      { id: 'p1', paragraphsSimp: DINGFENGBO_LINES, paragraphs: null },
      { id: 'p2', paragraphsSimp: ['一曲新愁酒一杯，去年天气旧亭台。'], paragraphs: null },
    ] as any);
    mocked.rerankTopN.mockResolvedValue(null as any);

    const r = await retrieveStyleExemplars('风雨中独行', STYLES.sushi);
    expect(r.rerankApplied).toBe(false);
    expect(r.exemplars).toHaveLength(1);
    expect(r.exemplars[0].title).toBe('定风波');
    expect(r.exemplars[0].sents).toHaveLength(11);
  });

  it('精排成功时按精排结果返回并标记 rerankApplied', async () => {
    mocked.embedText.mockResolvedValue([0.1, 0.2] as any);
    mocked.topKSimilar.mockResolvedValue([{ id: 'p1', title: '定风波', score: 0.9 }] as any);
    mocked.findMany.mockResolvedValue([
      { id: 'p1', paragraphsSimp: DINGFENGBO_LINES, paragraphs: null },
    ] as any);
    mocked.rerankTopN.mockResolvedValue([
      {
        item: { title: '定风波', sents: DINGFENGBO_LINES.flatMap(toSents), score: 0.9, body: '' },
        score: 0.95,
      },
    ] as any);

    const r = await retrieveStyleExemplars('风雨中独行', STYLES.sushi);
    expect(r.rerankApplied).toBe(true);
    expect(r.exemplars[0].rerankScore).toBe(0.95);
    expect(r.exemplars[0].sents[0]).toBe('莫听穿林打叶声，');
  });
});

function toSents(line: string): string[] {
  return line.split(/(?<=[，。])/).filter(Boolean);
}
