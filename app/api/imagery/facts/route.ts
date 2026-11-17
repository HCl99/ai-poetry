import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** 高频意象的字义与文化内涵（内置，保证离线可用；未命中走通用模板） */
const CULTURE: Record<string, { meaning: string; notes: string[] }> = {
  月: {
    meaning: '明月，古诗中最常见的意象之一',
    notes: ['思乡怀人：「举头望明月，低头思故乡」', '孤独寂寥：「举杯邀明月，对影成三人」', '团圆期盼：中秋之月承载千里共婵娟之意'],
  },
  酒: {
    meaning: '杯中物，诗中常与豪情、愁绪相伴',
    notes: ['壮志豪情：「会须一饮三百杯」', '借酒消愁：「抽刀断水水更流，举杯消愁愁更愁」', '送别饯行：「劝君更尽一杯酒」'],
  },
  风: {
    meaning: '自然之风，亦指时节、际遇、品格',
    notes: ['伤春悲秋：「风急天高猿啸哀」', '边塞豪情：「大风起兮云飞扬」', '品格高洁：「风流天下闻」'],
  },
  花: {
    meaning: '花木之花，常喻青春、美人、世事',
    notes: ['伤逝惜春：「花落知多少」', '美人自比：「人面桃花相映红」', '高洁品格：「出淤泥而不染」'],
  },
  山: {
    meaning: '山岳，常寄隐逸、壮志、乡愁',
    notes: ['隐逸之志：「采菊东篱下，悠然见南山」', '雄心壮志：「会当凌绝顶，一览众山小」', '羁旅愁思：「山远天高烟水寒」'],
  },
  水: {
    meaning: '水流，常喻愁绪、时光、柔情',
    notes: ['无尽愁思：「问君能有几多愁，恰似一江春水向东流」', '时光流逝：「逝者如斯夫，不舍昼夜」', '柔情蜜意：「柔情似水，佳期如梦」'],
  },
  云: {
    meaning: '浮云，常喻漂泊、隐逸、变幻',
    notes: ['漂泊不定：「浮云游子意，落日故人情」', '隐逸闲适：「行到水穷处，坐看云起时」', '功名虚幻：「富贵于我如浮云」'],
  },
  春: {
    meaning: '春季，常喻生机、青春、欢愉',
    notes: ['生机盎然：「春眠不觉晓，处处闻啼鸟」', '伤春惜时：「春花秋月何时了」', '思念怀人：「春风又绿江南岸」'],
  },
  秋: {
    meaning: '秋季，常喻萧瑟、悲凉、收获',
    notes: ['萧瑟悲凉：「万里悲秋常作客」', '思乡怀人：「洛阳城里见秋风」', '壮阔豪迈：「自古逢秋悲寂寥，我言秋日胜春朝」'],
  },
  雪: {
    meaning: '飞雪，常喻纯洁、苦寒、壮阔',
    notes: ['苦寒边塞：「忽如一夜春风来，千树万树梨花开」', '纯洁品格：「孤舟蓑笠翁，独钓寒江雪」', '壮阔景象：「北国风光，千里冰封，万里雪飘」'],
  },
  梦: {
    meaning: '梦境，常喻虚幻、思念、人生',
    notes: ['人生虚幻：「人生如梦，一尊还酹江月」', '思念绵长：「夜来幽梦忽还乡」', '虚幻无常：「庄生晓梦迷蝴蝶」'],
  },
  柳: {
    meaning: '柳树，「柳」谐「留」，常喻送别、留恋',
    notes: ['送别留恋：「渭城朝雨浥轻尘，客舍青青柳色新」', '思乡之情：「此夜曲中闻折柳，何人不起故园情」', '春意盎然：「碧玉妆成一树高，万条垂下绿丝绦」'],
  },
  梅: {
    meaning: '梅花，常喻高洁、坚韧、报春',
    notes: ['高洁孤傲：「疏影横斜水清浅，暗香浮动月黄昏」', '坚韧不屈：「零落成泥碾作尘，只有香如故」', '报春使者：「俏也不争春，只把春来报」'],
  },
  菊: {
    meaning: '菊花，常喻隐逸、高洁、长寿',
    notes: ['隐逸之志：「采菊东篱下，悠然见南山」', '高洁品格：「不是花中偏爱菊，此花开尽更无花」', '傲霜精神：「待到重阳日，还来就菊花」'],
  },
  松: {
    meaning: '松树，常喻坚韧、长寿、高洁',
    notes: ['坚韧不拔：「岁寒，然后知松柏之后凋也」', '高洁品格：「岂不罹凝寒，松柏有本性」', '长寿吉祥：「松鹤延年」'],
  },
  竹: {
    meaning: '竹子，常喻气节、虚心、坚韧',
    notes: ['气节操守：「咬定青山不放松，立根原在破岩中」', '虚心谦逊：「竹解心虚即我师」', '君子之风：「梅兰竹菊」四君子之一'],
  },
  舟: {
    meaning: '船舟，常喻漂泊、隐逸、自由',
    notes: ['漂泊羁旅：「孤帆远影碧空尽，惟见长江天际流」', '隐逸江湖：「小舟从此逝，江海寄余生」', '自由闲适：「一叶扁舟轻帆卷」'],
  },
  楼: {
    meaning: '楼阁，常喻登高望远、相思、感慨',
    notes: ['登高望远：「欲穷千里目，更上一层楼」', '相思怀远：「明月楼高休独倚」', '怀古伤今：「昔人已乘黄鹤去，此地空余黄鹤楼」'],
  },
  江: {
    meaning: '江河，常喻时光、愁绪、壮阔',
    notes: ['时光流逝：「大江东去，浪淘尽，千古风流人物」', '离愁别绪：「问君能有几多愁，恰似一江春水向东流」', '壮阔豪迈：「滚滚长江东逝水」'],
  },
  夜: {
    meaning: '夜晚，常喻静谧、孤独、思念',
    notes: ['静谧闲适：「明月松间照，清泉石上流」', '孤独思念：「姑苏城外寒山寺，夜半钟声到客船」', '思乡怀远：「露从今夜白，月是故乡明」'],
  },
};

/** 从诗句数组中找出含指定字的那一句 */
function findLineWithChar(lines: string[], char: string): string | null {
  for (const line of lines) {
    if (line.includes(char)) return line.replace(/[，。！？、；：]/g, '').trim();
  }
  return lines[0]?.replace(/[，。！？、；：]/g, '').trim() || null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const char = searchParams.get('char') || '';
  if (!char) return NextResponse.json({ error: '缺少 char 参数' }, { status: 400 });

  const culture = CULTURE[char] || {
    meaning: `「${char}」是古典诗词中的常见意象`,
    notes: [],
  };

  // 查含此字的诗，优先有注解的（质量更高），取 5 首
  // Prisma 对 JSON 数组包含查询支持有限，用原始 SQL（char 为单字，安全拼接）
  const safeChar = char.replace(/'/g, "''");
  const rows = await prisma.$queryRawUnsafe<
    { id: string; title: string; author: string; dynasty: string; paragraphs: string }[]
  >(
    `SELECT id, title, author, dynasty, paragraphs_simp AS paragraphs
     FROM poems
     WHERE paragraphs_simp LIKE '%${safeChar}%'
     ORDER BY RAND()
     LIMIT 5`,
  );

  const quotes = rows
    .map((r) => {
      let lines: string[] = [];
      if (Array.isArray(r.paragraphs)) {
        lines = r.paragraphs as string[];
      } else if (typeof r.paragraphs === 'string') {
        try {
          lines = JSON.parse(r.paragraphs) as string[];
        } catch {
          lines = [];
        }
      }
      const line = findLineWithChar(lines, char);
      return {
        id: String(r.id),
        title: r.title,
        author: r.author,
        dynasty: r.dynasty,
        line: line || '',
      };
    })
    .filter((q) => q.line);

  return NextResponse.json({
    char,
    meaning: culture.meaning,
    notes: culture.notes,
    quotes,
  });
}
