import { describe, it, expect } from 'vitest';
import { ANNOTATION_SECTIONS, emptySections, parseAnnotationSections, withFallback } from './sections';

describe('parseAnnotationSections 分节解析', () => {
  it('完整四节文本正确切分', () => {
    const text = '【字词释义】床指井栏。【典故溯源】典出《乐府》。【情感分析】思乡。【格律分析】五言绝句。';
    const r = parseAnnotationSections(text);
    expect(r.zici).toBe('床指井栏。');
    expect(r.diangu).toBe('典出《乐府》。');
    expect(r.qinggan).toBe('思乡。');
    expect(r.geli).toBe('五言绝句。');
  });

  it('流式中途只有半截标题时不误切', () => {
    const r = parseAnnotationSections('【字词释');
    expect(r.zici).toBe('');
    expect(r.diangu).toBe('');
  });

  it('流式中途标题完整而正文缺失也能归属空串', () => {
    const r = parseAnnotationSections('【字词释义】');
    expect(r.zici).toBe('');
  });

  it('流式中途正文截断到任意位置都可归属', () => {
    const r = parseAnnotationSections('【字词释义】床，井栏');
    expect(r.zici).toBe('床，井栏');
  });

  it('兼容方括号标题', () => {
    const r = parseAnnotationSections('[典故溯源]出自乐府。');
    expect(r.diangu).toBe('出自乐府。');
  });

  it('标题两侧允许空白', () => {
    const r = parseAnnotationSections('【 字词释义 】床指井栏。');
    expect(r.zici).toBe('床指井栏。');
  });

  it('模型漏标时未归属内容不强行猜测', () => {
    const r = parseAnnotationSections('一段没有分节标记的正文');
    expect(r).toEqual(emptySections());
  });

  it('正文含《诗题》引用不影响切分', () => {
    const r = parseAnnotationSections('【典故溯源】化用《静夜思》意象。');
    expect(r.diangu).toBe('化用《静夜思》意象。');
  });

  it('四节定义完整', () => {
    expect(ANNOTATION_SECTIONS.map((s) => s.key)).toEqual(['zici', 'diangu', 'qinggan', 'geli']);
  });
});

describe('withFallback 兜底', () => {
  it('四节全空但有正文时整段归入字词释义', () => {
    const r = withFallback('一整段没有分节的内容', emptySections());
    expect(r.zici).toBe('一整段没有分节的内容');
    expect(r.diangu).toBe('');
  });

  it('兜底时剥离空标题标记', () => {
    const r = withFallback('【】残缺标记正文', emptySections());
    expect(r.zici).toBe('残缺标记正文');
  });

  it('已有分节内容时不兜底', () => {
    const sections = { ...emptySections(), zici: '已有内容' };
    const r = withFallback('整段正文', sections);
    expect(r.zici).toBe('已有内容');
  });

  it('正文为空时不兜底', () => {
    const r = withFallback('   ', emptySections());
    expect(r.zici).toBe('');
  });
});
