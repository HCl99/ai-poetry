import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POST_CATEGORIES, MAX_CATEGORIES, validateCategories,
} from '../postCategories';

/** 管理端分类配置的纯函数校验；文件读写由接口层负责，这里不依赖真实磁盘状态 */
describe('validateCategories', () => {
  const base = () => DEFAULT_POST_CATEGORIES.map((c) => ({ ...c }));

  it('接受内置默认分类', () => {
    const list = validateCategories(base());
    expect(list).toHaveLength(4);
    expect(list[0].name).toBe('诗词赏析');
  });

  it('补齐空描述，裁剪首尾空白', () => {
    const list = validateCategories([{ id: 'x', name: '  格律探讨  ', desc: '  讨论平仄  ' }]);
    expect(list[0]).toEqual({ id: 'x', name: '格律探讨', desc: '讨论平仄' });
  });

  it('空描述回落为占位文案', () => {
    expect(validateCategories([{ id: 'x', name: '问答', desc: '' }])[0].desc).toBe('暂无描述');
  });

  it.each([
    ['非数组', null],
    ['空数组', []],
    ['超长列表', Array.from({ length: MAX_CATEGORIES + 1 }, (_, i) => ({ id: `c${i}`, name: `类${i}`, desc: '' }))],
    ['缺 id', [{ name: '问答', desc: '' }]],
    ['缺名称', [{ id: 'x', desc: '' }]],
    ['名称超长', [{ id: 'x', name: '一二三四五六七八九十十一二', desc: '' }]],
    ['描述超长', [{ id: 'x', name: '问答', desc: '字'.repeat(61) }]],
    ['名称重复', [{ id: 'a', name: '问答', desc: '' }, { id: 'b', name: '问答', desc: '' }]],
    ['id 重复', [{ id: 'a', name: '问答', desc: '' }, { id: 'a', name: '赏析', desc: '' }]],
    ['元素非对象', ['问答']],
  ])('拒绝%s', (_label, input) => {
    expect(() => validateCategories(input)).toThrow();
  });

  it('允许新增自定义分类并稳定保留顺序', () => {
    const input = [...base(), { id: 'custom-1', name: '格律探讨', desc: '平仄与用韵' }];
    const list = validateCategories(input);
    expect(list).toHaveLength(5);
    expect(list[4].name).toBe('格律探讨');
  });
});
