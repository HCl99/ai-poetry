import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { checkAiRateLimit } from '@/lib/rateLimit';
import { screenInput } from '@/lib/content-filter';
import { getAiClient } from '@/lib/aiClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = getAiClient();

const MODEL = 'glm-4v-flash';
const IMAGE_PREFIX = /^data:image\/(png|jpeg|webp);base64,/;
/** data URL 中 base64 部分上限：约 4MB 原始图片 */
const MAX_BASE64_CHARS = 5_600_000;
const POEM_LIMIT = 6;

/**
 * F5 以图搜诗：GLM-4V 识别画面意象 → 到 poem_imagery 反查意境相近诗篇。
 * 只依据库内真实意象关联返回诗篇，不生成/编造诗篇。
 */
const SYSTEM_PROMPT = `你是古典诗词意象识别助手。只依据画面中真实可见的内容作答，严禁编造诗篇、诗句或作者。
只输出一个严格 JSON 对象，不要输出 Markdown 代码块、解释或任何多余文字：
{"imagery":["月","舟"],"mood":"清冷孤寂","scene":"月下一叶孤舟漂于江面","keywords":["夜江","孤舟","月色"]}
字段要求：
- imagery：画面中可见的古典诗词常见意象，每项 1-2 个汉字，最多 6 个，按显著程度排序；画面中确实没有时给空数组。
- mood：整体情绪氛围，不超过 8 个汉字。
- scene：一句话描述画面内容，不超过 30 个汉字。
- keywords：辅助检索关键词，最多 4 个，每个不超过 6 个汉字。`;

interface Analysis {
  imagery: string[];
  mood: string;
  scene: string;
  keywords: string[];
}

function textOf(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** 剥离 ```json 代码围栏并宽松定位首个 JSON 对象，解析失败返回 null */
function parseAnalysis(raw: string): Analysis | null {
  let s = (raw || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;

  const imagery = Array.isArray(o.imagery)
    ? [...new Set(
        o.imagery
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.replace(/[《》〈〉「」『』，。、；：！？\s]/g, ''))
          .filter((x) => /^[\u4e00-\u9fa5]{1,2}$/.test(x)),
      )].slice(0, 6)
    : [];
  const keywords = Array.isArray(o.keywords)
    ? [...new Set(
        o.keywords
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.replace(/[《》〈〉「」『』，。、；：！？\s]/g, ''))
          .filter((x) => x.length > 0),
      )].slice(0, 4).map((x) => x.slice(0, 6))
    : [];

  const analysis: Analysis = {
    imagery,
    mood: textOf(o.mood, 12),
    scene: textOf(o.scene, 40),
    keywords,
  };
  // 模型未按约定字段作答（如返回说明性文字）视为解析失败；
  // 字段齐全但内容为空（画面中确无意象）则保留为空结果，由前端明确提示。
  if (!['imagery', 'mood', 'scene', 'keywords'].some((k) => k in o)) return null;
  return analysis;
}

/** 从 paragraphs_simp 取前两句，服务端截断 */
function excerptOf(val: unknown, limit = 60): string {
  let arr: unknown = val;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      arr = [arr];
    }
  }
  if (!Array.isArray(arr)) return '';
  const sents: string[] = [];
  for (const line of arr) {
    if (typeof line !== 'string') continue;
    const parts = line.match(/[^，。！？；、]*[，。！？；、]|[^，。！？；、]+$/g) || [line];
    for (const p of parts) {
      const t = p.trim();
      if (t) sents.push(t);
    }
    if (sents.length >= 2) break;
  }
  return sents.slice(0, 2).join('').slice(0, limit);
}

/** 模型意象 → 库内意象字符：整体命中优先，否则拆字命中（如「明月」→「月」） */
function toLookupChars(imagery: string[], known: Set<string>): string[] {
  const out = new Set<string>();
  for (const term of imagery) {
    if (known.has(term)) out.add(term);
    else for (const ch of term) if (known.has(ch)) out.add(ch);
  }
  return [...out];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'vision', 5);
  if (limited) return limited;

  let body: { image?: string; note?: string };
  try {
    body = (await req.json()) as { image?: string; note?: string };
  } catch {
    return Response.json({ error: '请求格式有误，请重新上传图片' }, { status: 400 });
  }

  const image = typeof body.image === 'string' ? body.image : '';
  if (!image) return Response.json({ error: '请先选择一张图片' }, { status: 400 });
  if (!IMAGE_PREFIX.test(image)) {
    return Response.json({ error: '仅支持 PNG / JPEG / WebP 格式的图片' }, { status: 400 });
  }
  if (image.length - image.indexOf(',') - 1 > MAX_BASE64_CHARS) {
    return Response.json({ error: '图片过大，请选择小于 4MB 的图片' }, { status: 400 });
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 80) : '';
  const screen = screenInput(note);
  if (!screen.ok) return Response.json({ error: screen.reason }, { status: 400 });
  const prompt = note
    ? `请识别这张图片中的诗词意象。用户补充说明（仅作参考，以画面实际内容为准）：${note}`
    : '请识别这张图片中的诗词意象。';

  /* ---- 阶段 1：GLM-4V 识图，严格 JSON ---- */
  let raw = '';
  try {
    const resp = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });
    raw = (resp.choices?.[0]?.message?.content || '').slice(0, 2000);
  } catch (e: any) {
    console.error('vision model error', e?.message || e);
    return Response.json({ error: '识图服务暂时不可用，请稍后重试' }, { status: 502 });
  }

  const analysis = parseAnalysis(raw);
  if (!analysis) {
    console.error('vision parse failed', raw.slice(0, 200));
    return Response.json({ error: '未能识别画面内容，请换一张更清晰的图片重试' }, { status: 502 });
  }

  /* ---- 阶段 2：意象反查诗篇（库内真实关联） ---- */
  // 透出推理链数据：最终用于查库的意象字、每首诗命中的意象字与共现权重和，供前端做可解释展示
  let poems: { id: string; title: string; author: string; dynasty: string; excerpt: string; matchedChars: string[]; coocScore: number }[] = [];
  let lookupChars: string[] = [];
  try {
    if (analysis.imagery.length) {
      const knownRows = await prisma.poemImagery.findMany({
        distinct: ['imageryChar'],
        select: { imageryChar: true },
      });
      const known = new Set(knownRows.map((r) => r.imageryChar));
      const lookup = toLookupChars(analysis.imagery, known);
      lookupChars = lookup;

      if (lookup.length) {
        const links = await prisma.poemImagery.findMany({
          where: { imageryChar: { in: lookup } },
          select: { poemId: true, imageryChar: true },
        });
        const byPoem = new Map<string, Set<string>>();
        for (const l of links) {
          const set = byPoem.get(l.poemId) || new Set<string>();
          set.add(l.imageryChar);
          byPoem.set(l.poemId, set);
        }

        // 共现权重：同一首诗内命中意象两两在库中的共现次数之和
        const edges = lookup.length > 1
          ? await prisma.imageryCooccurrence.findMany({
              where: { sourceChar: { in: lookup }, targetChar: { in: lookup } },
              select: { sourceChar: true, targetChar: true, weight: true },
            })
          : [];
        const coocOf = (set: Set<string>) => {
          let sum = 0;
          for (const e of edges) {
            if (set.has(e.sourceChar) && set.has(e.targetChar) && e.sourceChar !== e.targetChar) sum += e.weight;
          }
          return sum;
        };

        const ranked = [...byPoem.entries()]
          .map(([id, set]) => ({ id, chars: [...set], matched: set.size, cooc: coocOf(set) }))
          .sort((a, b) => b.matched - a.matched || b.cooc - a.cooc || a.id.localeCompare(b.id))
          .slice(0, POEM_LIMIT);

        if (ranked.length) {
          const rows = await prisma.poem.findMany({
            where: { id: { in: ranked.map((r) => r.id) } },
            select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true },
          });
          const map = new Map(rows.map((r) => [r.id, r]));
          poems = ranked
            .map((r) => {
              const row = map.get(r.id);
              if (!row) return null;
              return {
                id: row.id,
                title: row.title,
                author: row.author,
                dynasty: row.dynasty,
                excerpt: excerptOf(row.paragraphsSimp),
                matchedChars: r.chars,
                coocScore: r.cooc,
              };
            })
            .filter((r): r is NonNullable<typeof r> => !!r);
        }
      }
    }
  } catch (e: any) {
    console.error('vision lookup error', e?.message || e);
    return Response.json({ error: '诗篇检索失败，请稍后重试' }, { status: 500 });
  }

  // 记录本次识图结果，供「我的创作」回溯
  try {
    await prisma.aiCreation.create({
      data: {
        userId: session.user.id,
        kind: 'vision',
        prompt: note || analysis.scene || '以图搜诗',
        result: { analysis: { ...analysis, lookupChars }, poemIds: poems.map((p) => p.id) },
      },
    });
  } catch (e: any) {
    console.error('save vision creation error', e?.message || e);
  }

  return Response.json({ analysis: { ...analysis, lookupChars }, poems });
}
