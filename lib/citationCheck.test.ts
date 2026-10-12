import { describe, it, expect } from 'vitest';
import { checkCitations } from './citationCheck';

describe('checkCitations 引用硬约束校验', () => {
  it('引用检索列表内的诗题判为合规', () => {
    const r = checkCitations('此句化用《静夜思》的意境', '望庐山瀑布', ['静夜思', '春晓']);
    expect(r.valid).toEqual(['静夜思']);
    expect(r.invalid).toEqual([]);
    expect(r.total).toBe(1);
  });

  it('引用列表之外的诗题判为越界（幻觉）', () => {
    const r = checkCitations('与《杜撰集》一脉相承', '望庐山瀑布', ['静夜思']);
    expect(r.invalid).toEqual(['杜撰集']);
    expect(r.valid).toEqual([]);
    expect(r.total).toBe(1);
  });

  it('本诗自身的《诗题》不计入统计（排除自身引用）', () => {
    const r = checkCitations('《望庐山瀑布》全诗以庐山之雄奇起笔', '望庐山瀑布', ['静夜思']);
    expect(r.total).toBe(0);
    expect(r.valid).toEqual([]);
    expect(r.invalid).toEqual([]);
  });

  it('多引用混合时分别归类', () => {
    const r = checkCitations('《静夜思》与《春晓》对读，亦近《杜撰集》', '本诗', ['静夜思', '春晓']);
    expect(r.valid).toEqual(['静夜思', '春晓']);
    expect(r.invalid).toEqual(['杜撰集']);
    expect(r.total).toBe(3);
  });

  it('同一诗题重复引用逐次计数', () => {
    const r = checkCitations('《静夜思》…《静夜思》', '本诗', ['静夜思']);
    expect(r.valid).toEqual(['静夜思', '静夜思']);
    expect(r.total).toBe(2);
  });

  it('无书名号或空文本返回零统计', () => {
    expect(checkCitations('没有任何引用', '本诗', ['静夜思']).total).toBe(0);
    expect(checkCitations('', '本诗', ['静夜思']).total).toBe(0);
  });

  it('书名号内空白与换行容错', () => {
    const r = checkCitations('参考《 静夜思 》', '本诗', ['静夜思']);
    expect(r.valid).toEqual(['静夜思']);
  });
});
