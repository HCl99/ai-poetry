/**
 * Agent 工具注册表（注解编排器使用）。
 * 每个工具只做一件可验证的事，返回结构化的 observation，便于：
 *  1. 编排器决定下一步（不依赖模型自觉）；
 *  2. 前端「思考轨迹」展示工具名、耗时、命中数；
 *  3. 生成阶段把确定性事实（格律）注入提示词，减少模型臆断。
 */
import { prisma } from '../prisma';
import { retrieveRelatedPoems, type RelatedPoem } from '../annotationRetrieval';
import { embedText } from '../embedding';
import { vectorCorpusSize } from '../vectorStore';
import { checkMeter, meterFormFor, summarizeMeter, type MeterReport, type MeterForm } from '../meter';

export type ToolName = 'search_poems' | 'get_poet_bio' | 'get_imagery_meaning' | 'check_meter';

export interface AgentInput {
  poemId: string;
  title: string;
  author: string;
  dynasty: string;
  body: string;
  lines: string[];
}

export interface AgentState {
  related: RelatedPoem[];
  rerankApplied: boolean;
  useVector: boolean;
  corpusSize: number;
  bioCtx: string;
  imageryCtx: string;
  meter?: { form: MeterForm; pass: boolean; summary: string; report: MeterReport };
}

export interface ToolResult {
  /** 面向前端的一句话结论 */
  detail: string;
  /** 命中条数，用于在轨迹里显示「命中 N」 */
  hits?: number;
  /** 无结果时标记，编排器据此调整后续策略 */
  empty?: boolean;
}

interface ToolDef {
  label: string;
  run: (input: AgentInput, state: AgentState) => Promise<ToolResult>;
}

/* ================= 检索结果短期缓存（同诗 5 分钟内复用，避免重复向量化与精排） ================= */
const SEARCH_TTL_MS = 5 * 60 * 1000;
interface SearchCacheEntry {
  at: number;
  related: RelatedPoem[];
  rerankApplied: boolean;
  useVector: boolean;
  corpusSize: number;
}
const _searchGlobal = globalThis as unknown as { __agentSearchCache?: Map<string, SearchCacheEntry> };
function searchCache(): Map<string, SearchCacheEntry> {
  if (!_searchGlobal.__agentSearchCache) _searchGlobal.__agentSearchCache = new Map();
  return _searchGlobal.__agentSearchCache;
}

/**
 * 回填逐句文本并定位「与本诗字符重合度最高」的句子，供前端引用跳转高亮。
 * 检索层返回的 body 是拼接后的整串，无法断句，这里按 paragraphsSimp 重新取一次。
 */
async function attachLines(input: AgentInput, state: AgentState): Promise<void> {
  if (!state.related.length) return;
  const rows = await prisma.poem.findMany({
    where: { id: { in: state.related.map((r) => r.id) } },
    select: { id: true, paragraphsSimp: true },
  });
  const lineMap = new Map(
    rows.map((r) => [r.id, ((r.paragraphsSimp as string[] | null) || []).filter((s) => s && s.trim())]),
  );
  const queryChars = new Set(
    input.lines.join('').split('').filter((ch) => /[\u4e00-\u9fff]/.test(ch)),
  );
  state.related = state.related.map((r) => {
    const lines = lineMap.get(r.id) || [];
    let best = -1;
    let bestScore = -1;
    lines.forEach((ln, i) => {
      const score = ln.split('').filter((ch) => queryChars.has(ch)).length;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return { ...r, lines, matchedLine: best >= 0 ? best : undefined };
  });
}

export const TOOLS: Record<ToolName, ToolDef> = {
  search_poems: {
    label: '混合语义检索（向量+关键词→精排）',
    async run(input, state) {
      const key = input.poemId;
      const cached = searchCache().get(key);
      if (cached && Date.now() - cached.at < SEARCH_TTL_MS) {
        state.related = cached.related;
        state.rerankApplied = cached.rerankApplied;
        state.useVector = cached.useVector;
        state.corpusSize = cached.corpusSize;
        return {
          hits: cached.related.length,
          empty: cached.related.length === 0,
          detail: `复用 5 分钟内的检索结果（跳过向量化与精排）· 命中 ${cached.related.length} 篇`,
        };
      }

      const queryText = `《${input.title}》${input.author}：${input.body.replace(/\n/g, '')}`.slice(0, 400);
      let fallbackNote = '';

      // ========== 降级路径 1：向量化失败 → 强制用关键词 BM25 ==========
      let queryVec: number[] | null = null;
      try {
        queryVec = await embedText(queryText);
      } catch (e: any) {
        fallbackNote = '降级：向量化服务不可用，改用关键词 BM25 粗排';
      }

      state.corpusSize = await vectorCorpusSize().catch(() => 0);
      state.useVector = !!queryVec && state.corpusSize > 0;

      // ========== 降级路径 2：检索失败 → Prisma 数据库 LIKE 关键词兜底 ==========
      let res;
      try {
        res = await retrieveRelatedPoems({
          poemId: input.poemId,
          title: input.title,
          author: input.author,
          queryText,
          queryVec,
          useVector: state.useVector,
        });
      } catch (e: any) {
        fallbackNote = fallbackNote || '降级：混合检索服务不可用，改用 Prisma 数据库关键词 LIKE 兜底';
        // 最兜底：用 Prisma 查含标题/作者/诗句关键词的诗
        const keywords = [input.title, input.author, ...input.lines.slice(0, 2)].filter(Boolean).slice(0, 3);
        const rows = await prisma.poem.findMany({
          where: {
            NOT: { id: input.poemId },
            OR: keywords.map((k) => ({ paragraphsSimp: { array_contains: k } })),
          },
          take: 10,
          select: { id: true, title: true, author: true, dynasty: true, paragraphsSimp: true },
        });
        res = {
          related: rows.map((r) => ({
            id: r.id, title: r.title, author: r.author, dynasty: r.dynasty,
            body: ((r.paragraphsSimp as string[] | null) || []).join(''),
            score: 0.5,
          })),
          rerankApplied: false,
        };
      }

      state.related = res.related;
      state.rerankApplied = res.rerankApplied;
      await attachLines(input, state);
      searchCache().set(key, {
        at: Date.now(),
        related: state.related,
        rerankApplied: state.rerankApplied,
        useVector: state.useVector,
        corpusSize: state.corpusSize,
      });
      const top = res.related.slice(0, 3).map((r) => `《${r.title}》`).join('、');
      const detail = [
        state.useVector ? `向量库 ${state.corpusSize} 篇` : (state.related.length ? '关键词 BM25' : '向量不可用'),
        res.rerankApplied ? 'CrossEncoder 精排' : '粗排',
        fallbackNote,
        res.related.length ? `命中 ${res.related.length} 篇：${top}` : '未检索到同类诗篇',
      ].filter(Boolean).join(' · ');
      return { hits: res.related.length, empty: res.related.length === 0, detail };
    },
  },

  get_poet_bio: {
    label: '查询诗人小传',
    async run(input, state) {
      const bio = await prisma.poetBio.findFirst({ where: { name: input.author } });
      state.bioCtx = bio?.bioSimp?.slice(0, 260) || bio?.bioDesc?.slice(0, 260) || '';
      return {
        empty: !state.bioCtx,
        detail: state.bioCtx ? `已载入《${input.author}》传记 ${state.bioCtx.length} 字` : `小传库无《${input.author}》，按通行注本推断`,
      };
    },
  },

  get_imagery_meaning: {
    label: '查询核心意象全库频次',
    async run(input, state) {
      // 兜底：如果 orchestrator 没条件触发，这里自己判断无意象就跳过
      const IMAGERY_HINTS = /(月|花|风|雨|雪|山|水|云|烟|柳|梅|菊|雁|燕|蝉|蝶|春|秋|冬|夏|酒|剑|舟|楼|亭|桥)/;
      if (!IMAGERY_HINTS.test(input.body) && !IMAGERY_HINTS.test(input.title)) {
        return { empty: true, detail: '未检测到常见意象，跳过意象检索' };
      }

      const rows = await prisma.poemImagery.findMany({
        where: { poemId: input.poemId },
        take: 3,
        select: { imageryChar: true },
      });
      const chars = rows.map((r) => r.imageryChar);
      if (!chars.length) return { empty: true, detail: '未识别到核心意象（全库无标注），跳过' };
      const stats = await prisma.imagery.findMany({ where: { char: { in: chars } }, select: { char: true, count: true } });
      const map = new Map(stats.map((s) => [s.char, s.count]));
      state.imageryCtx = chars.map((c) => `「${c}」（全库 ${map.get(c) ?? 0} 首）`).join('、');
      return { hits: chars.length, detail: state.imageryCtx };
    },
  },

  check_meter: {
    label: '格律校验（中华新韵，本地算法）',
    async run(input, state) {
      if (input.lines.length < 2) return { empty: true, detail: '句数不足，跳过格律校验' };
      const genre: '诗' | '词' = /[·・]/.test(input.title) ? '词' : '诗';
      const form = meterFormFor(input.lines.map((l) => l.replace(/[^\u4e00-\u9fff]/g, '').length), genre);
      const report = checkMeter(input.lines, form);
      state.meter = { form, pass: report.pass, summary: summarizeMeter(report, 160), report };
      const genreHint = genre === '词' ? '（词仅校验押韵，平仄逐牌而异留待后续）' : '';
      return {
        detail: report.pass
          ? `体裁 ${form} · 押韵${report.rhymeOk ? '合规' : '存疑'} · 平仄${report.pingzeOk ? '合规' : '宽检提示'}${genreHint}`
          : `体裁 ${form} · 待核：${state.meter.summary}${genreHint}`,
      };
    },
  },
};

/** 编排器对外暴露的工具清单（供文档/前端标注使用） */
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];
