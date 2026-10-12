import { prisma } from '@/lib/prisma';

/**
 * 多模态联动：扫描文本（注解全文+原诗）中命中的库内核心意象字。
 * 按文中出现频次降序、库内热度降序排序，供前端驱动意境图生成，
 * 使配图语义来自"AI 对这首诗的理解"而非简单标签。
 */
export async function detectImageryChars(text: string, take = 4): Promise<string[]> {
  const rows = await prisma.imagery.findMany({ select: { char: true, count: true }, orderBy: { count: 'desc' } });
  return rows
    .map((r) => ({ char: r.char, times: text.split(r.char).length - 1, hot: r.count }))
    .filter((r) => r.times > 0)
    .sort((a, b) => b.times - a.times || b.hot - a.hot)
    .slice(0, take)
    .map((r) => r.char);
}
