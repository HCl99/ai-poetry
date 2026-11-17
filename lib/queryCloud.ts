// 检索词云：从 annotation_logs.userQuery 提取「完整检索意图」并统计频次。
// 旧实现用 2–4 字 n-gram，会把「有哪些送别诗」拆成「些送别」「送别诗」这类残缺碎片，展示效果很差。
// 现在改为：先清洗掉口语前后缀，再整词计数；只有清洗后仍有实义、且不是停用词的才进入词云。
import { prisma } from '@/lib/prisma';

export interface CloudWord {
  text: string;
  count: number;
}

// 虚词/语气字：整词中只要出现就丢弃（避免「诗中」「其二」这类残片）
const STOP_CHARS = '的了吗呢吧啊嘛么你我他她它这那也又就都还是很把被让向着只是而已并且或者所以如果因为但是就是不是有没有什么怎么哪谁几多少能不能可以会不会要不要请帮噢呀哈呗喽过';

const STOP_WORDS = new Set([
  '一下', '请问', '帮我', '介绍', '解释', '赏析', '翻译', '意思', '含义', '诗人', '作者',
  '这首', '诗句', '诗歌', '古诗', '诗词', '唐代', '宋代', '一个', '一些', '知道', '觉得',
  '背景', '内容', '作品', '创作', '描写', '表达', '运用', '手法', '了解', '讲述', '进行',
  '相关', '关于', '之中', '里面', '中的', '现代', '白话', '注释', '逐句', '全文',
  '情感', '主题', '思想', '意境', '赏析一下', '什么意思',
  '诗中', '诗里', '词中', '文中', '诗里中',
]);

/** 口语前缀：请 / 帮我 / 有哪些 / 写一首 …（反复剥离直到稳定） */
const LEAD = /^(?:请问一下|请问|帮我|帮忙|给我|我想知道|我想了解|我想|想知道|想了解|想|需要|能不能|可以|能否|麻烦|一起来|来一首|来|找一下|查找一下|查找|查一下|查|搜一下|搜索|搜|找|看看|看一下|看|讲讲|讲一讲|讲|说说|说一下|说|介绍一下|介绍|推荐一下|推荐|有没有|有哪些|有什么|有哪|哪些|哪首|什么|关于|有关|写一首|写首|写|作一首|作|生成|一首|一句|一些)+/;
/** 口语后缀：呢 / 吗 / 的诗 / 其一 …（反复剥离直到稳定） */
const TAIL = /(?:是什么意思|什么意思|是什么|有哪些|怎么样|为什么|呢|吗|吧|啊|呀|嘛|么|的|了|诗|诗词|古诗|诗句|作品|一首诗|首诗|其[一二三四五六七八九十百]+)+$/;

const CJK = /[\u4e00-\u9fff]+/g;

/** 清洗一条检索：按中文片段切分，各自剥离口语前后缀 */
function cleanQuery(raw: string): string[] {
  const runs = (raw || '').match(CJK) || [];
  const out: string[] = [];
  for (const run of runs) {
    let s = run;
    for (let i = 0; i < 4; i++) {
      const before = s;
      s = s.replace(LEAD, '').replace(TAIL, '');
      if (s === before) break;
    }
    if (s) out.push(s);
  }
  return out;
}

/** 是否为可用于词云的有效词 */
function usable(w: string): boolean {
  if (w.length < 2 || w.length > 14) return false;
  if (STOP_WORDS.has(w)) return false;
  if ([...w].some((ch) => STOP_CHARS.includes(ch))) return false;
  // 纯序数/量词残片
  if (/^(?:其[一二三四五六七八九十]+|一|二|三|四|五|六|七|八|九|十|首|句|篇|个|些)$/.test(w)) return false;
  return true;
}

export async function getQueryCloud(take = 60, scanLimit = 3000): Promise<{ words: CloudWord[]; total: number }> {
  const rows = await prisma.annotationLog.findMany({
    // 排除 RAG 评测写入的 eval: 记录，否则评测会把「用户检索词云」污染成诗题列表
    where: { userQuery: { not: null }, NOT: { userQuery: { startsWith: 'eval:' } } },
    select: { userQuery: true },
    orderBy: { id: 'desc' },
    take: scanLimit,
  });

  const counter = new Map<string, number>();
  for (const r of rows) {
    for (const w of cleanQuery(r.userQuery || '')) {
      if (!usable(w)) continue;
      counter.set(w, (counter.get(w) || 0) + 1);
    }
  }

  // 频次降序；同频次时更具体的词（更长）优先
  const sorted = [...counter.entries()]
    .filter(([w, c]) => c >= 1 && usable(w))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);

  // 去重：与已选词互为子串的丢弃（保留先出现的高频/长词），避免「秋胡行」「秋胡行二首」并存
  const picked: CloudWord[] = [];
  for (const [w, c] of sorted) {
    if (picked.length >= take) break;
    if (picked.some((p) => p.text.includes(w) || w.includes(p.text))) continue;
    picked.push({ text: w, count: c });
  }
  return { words: picked, total: rows.length };
}
