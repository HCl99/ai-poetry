// 检索词云：从 annotation_logs.userQuery 中提取高频中文词（2-4 字 n-gram + 停用词过滤 + 子串去重）
import { prisma } from '@/lib/prisma';

// 虚词/语气字：含其中任一字的 n-gram 直接丢弃
const STOP_CHARS = '的了吗呢吧啊嘛么你我他她它这那也又就都还很把被让向着只是而已并且或者所以如果因为但是就是不是有没有什么怎么哪谁几多少能不能可以会不会要不要请帮噢呀哈呗喽着呢过';
const STOP_WORDS = new Set([
  '一下', '请问', '帮我', '介绍', '解释', '赏析', '翻译', '意思', '含义', '诗人', '作者',
  '这首', '诗句', '诗歌', '古诗', '诗词', '唐代', '宋代', '一个', '一些', '知道', '觉得',
  '背景', '内容', '作品', '创作', '描写', '表达', '运用', '手法', '了解', '讲述', '进行',
  '相关', '关于', '之中', '里面', '中的', '现代', '白话', '注释', '逐句', '全文',
]);

export interface CloudWord {
  text: string;
  count: number;
}

export async function getQueryCloud(take = 60, scanLimit = 3000): Promise<{ words: CloudWord[]; total: number }> {
  const rows = await prisma.annotationLog.findMany({
    where: { userQuery: { not: null } },
    select: { userQuery: true },
    orderBy: { id: 'desc' },
    take: scanLimit,
  });

  const counter = new Map<string, number>();
  const cjk = /[\u4e00-\u9fff]+/g;
  for (const r of rows) {
    const runs = (r.userQuery || '').match(cjk) || [];
    for (const run of runs) {
      const n = run.length;
      // 整段计数（完整诗题/诗句优先；2-4 字已由 n-gram 覆盖，不重复计）
      if (n >= 5 && n <= 12 && ![...run].some((ch) => STOP_CHARS.includes(ch))) {
        counter.set(run, (counter.get(run) || 0) + 1);
      }
      // n-gram 兜底
      for (let len = 2; len <= 4 && len <= n; len++) {
        for (let i = 0; i + len <= n; i++) {
          const w = run.slice(i, i + len);
          if ([...w].some((ch) => STOP_CHARS.includes(ch))) continue;
          counter.set(w, (counter.get(w) || 0) + 1);
        }
      }
    }
  }

  // 频次降序，同频次长词优先（完整诗题 > 其碎片 n-gram）
  const sorted = [...counter.entries()]
    .filter(([w, c]) => c >= 2 && !STOP_WORDS.has(w))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);

  // 重叠去重：与已选高频词共享任一双字组的候选一律跳过（覆盖子串与滑窗碎片）
  const bigrams = (w: string) => {
    const s = new Set<string>();
    for (let i = 0; i + 2 <= w.length; i++) s.add(w.slice(i, i + 2));
    return s;
  };
  const picked: CloudWord[] = [];
  const pickedGrams: Set<string>[] = [];
  for (const [w, c] of sorted) {
    if (picked.length >= take) break;
    const g = bigrams(w);
    if (pickedGrams.some((pg) => [...g].some((b) => pg.has(b)))) continue;
    picked.push({ text: w, count: c });
    pickedGrams.push(g);
  }
  return { words: picked, total: rows.length };
}
