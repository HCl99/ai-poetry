import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runAnnotationAgent } from '@/lib/agents/orchestrator';

/**
 * 编排器单测：用假工具替换注册表，验证
 *  1. 一轮内按 plan 顺序执行全部工具并产出 act 事件；
 *  2. 检索命中时允许外部引用；
 *  3. 检索为空时进入「无依据」分支并停止继续规划。
 */
vi.mock('@/lib/agents/registry', () => {
  const TOOLS = {
    search_poems: {
      label: '混合语义检索',
      async run(_input: unknown, state: any) {
        if ((globalThis as any).__emptySearch) return { detail: '未命中', hits: 0, empty: true };
        state.related = [{ id: 'p1', title: '静夜思', author: '李白', dynasty: '唐', body: '床前明月光', score: 0.91 }];
        return { detail: '命中 1 篇', hits: 1 };
      },
    },
    get_poet_bio: {
      label: '查询诗人小传',
      async run(_input: unknown, state: any) {
        state.bioCtx = '李白，盛唐诗人';
        return { detail: '已载入小传' };
      },
    },
    get_imagery_meaning: { label: '核心意象', async run() { return { detail: '「月」全库 1024 首', hits: 1 }; } },
    check_meter: {
      label: '格律校验',
      async run(_input: unknown, state: any) {
        state.meter = { form: 'jueju5', pass: true, summary: '', report: {} as any };
        return { detail: '体裁 jueju5 · 押韵合规' };
      },
    },
  };
  return { TOOLS, TOOL_NAMES: Object.keys(TOOLS) };
});

const input = {
  poemId: 'p1',
  title: '静夜思',
  author: '李白',
  dynasty: '唐',
  body: '床前明月光\n疑是地上霜\n举头望明月\n低头思故乡',
  lines: ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡'],
};

describe('runAnnotationAgent', () => {
  beforeEach(() => {
    (globalThis as any).__emptySearch = false;
  });

  it('按 plan 执行全部工具并汇总观测（条件触发 + 并行）', async () => {
    const events: string[] = [];
    const bundle = await runAnnotationAgent(input, (e) => events.push(`${e.phase}:${e.tool || e.label}`));

    const acts = bundle.trace.filter((t) => t.phase === 'act');
    // 新逻辑：check_meter 串行先跑 → 其余并行（按传入顺序）；有意图象时触发 get_imagery_meaning
    expect(acts.map((t) => t.tool)).toEqual(['check_meter', 'search_poems', 'get_poet_bio', 'get_imagery_meaning']);
    expect(bundle.trace.some((t) => t.phase === 'plan')).toBe(true);
    expect(bundle.trace.some((t) => t.phase === 'observe')).toBe(true);
    expect(events[0]).toMatch(/^plan:/);
    expect(bundle.allowExternalCitation).toBe(true);
    expect(bundle.rounds).toBe(1);
    expect(bundle.meter?.pass).toBe(true);
    // v2 新增字段验证
    expect(bundle.toolCalls).toBe(4);
    // totalMs 是毫秒级墙钟耗时；mock 工具同步返回时整轮可能落在同一毫秒内，合法值为 0
    expect(bundle.totalMs).toBeGreaterThanOrEqual(0);
    expect(bundle.fallbacks).toEqual([]);
  });

  it('检索为空时关闭外部引用并停止继续规划', async () => {
    (globalThis as any).__emptySearch = true;
    const bundle = await runAnnotationAgent(input);
    expect(bundle.related).toHaveLength(0);
    expect(bundle.allowExternalCitation).toBe(false);
    const observes = bundle.trace.filter((t) => t.phase === 'observe');
    expect(observes.at(-1)?.detail).toContain('无同类诗篇佐证');
  });
});
