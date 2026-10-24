/**
 * 格律后校验器（自研算法，回应「全是 API 封装」的技术质疑）：
 * 对 AI 生成的古诗词按**中华新韵（十四韵部，依现代汉语拼音）**做押韵与平仄后校验。
 *
 * 数据：lib/data/xinyun.json（scripts/gen_xinyun_data.py 基于 pypinyin 构建期生成）。
 *
 * 宽严口径（AI 生成辅助校验，宁宽勿严，避免误杀导致重写全败）：
 *  1. 多音字仅取默认首读音（数据生成时的近似，不逐词辨析）；
 *  2. 古入声字按今读标调——如「白」今读平声则按平判定，不回溯平水韵入声，
 *     故对唐人原作的平仄结论可能与古谱略有出入，属预期取舍；
 *  3. 未知字（未收录字/emoji/西文）不参与判定，仅记录在 unknownChars；
 *  4. 轻声字平仄存疑，不参与判定；
 *  5. 律绝：首句入韵与否均宽容；平仄「一三五不论」，只查关键位置——
 *     硬规则：偶数句末字须为平声、奇数句（首句除外）末字须为仄声（近体诗押平韵的骨架）；
 *     软规则：句内第 2、4（、6）字平仄交替（二四六分明），违规数未过半则不判负，
 *     以容纳古绝遗响与合理拗救（如《静夜思》按今读有两处不交替）；
 *  6. 词（定风波/浣溪沙）只校验押韵位置，不校验平仄——词谱平仄逐牌而异，
 *     留作后续精度空间（见 cipai 分支注释）。
 */
import xinyun from './data/xinyun.json';

export type Pingze = '平' | '仄';
export type MeterForm = 'jueju5' | 'jueju7' | 'lvshi7' | 'cipai';

export interface LineReport {
  /** 原句（已剔除标点） */
  text: string;
  /** 逐字平仄序列（'?' = 未收录/轻声，不参与判定） */
  pingze: (Pingze | '?')[];
  /** 韵脚字（句末字） */
  rhymeChar: string;
  /** 韵脚部名（如「十唐」），未收录为 null */
  rhymeGroup: string | null;
  /** 本句违规/提示描述 */
  issues: string[];
}

export interface MeterReport {
  pass: boolean;
  rhymeOk: boolean;
  /** 词恒为 true（词谱平仄为后续精度空间） */
  pingzeOk: boolean;
  lines: LineReport[];
  /** 未收录字（不参与判定） */
  unknownChars: string[];
}

/** 韵部序号（1-14）→ 韵部名 */
const RHYMES: string[] = (xinyun as { rhymes: string[] }).rhymes;

/** 字 → [声调(1-4, 轻声5), 韵部序号(1-14)]；模块加载时由紧凑分组格式展开一次 */
const CHAR_MAP: Map<string, [number, number]> = (() => {
  const m = new Map<string, [number, number]>();
  const data = (xinyun as { data: Record<string, string> }).data;
  for (const [key, chars] of Object.entries(data)) {
    const [t, r] = key.split('-').map(Number);
    // for..of 按码点遍历，对增补平面汉字（代理对）同样安全
    for (const ch of chars) m.set(ch, [t, r]);
  }
  return m;
})();

/** 标点/空白字符集（计字与取韵脚时剔除），与 transfer 路由口径一致 */
const STRIP_RE = /[，。！？；：、（）「」『』《》〈〉〔〕【】·\s]/g;

/** 单字平仄：平(1/2 声) / 仄(3/4 声) / null(未知字或轻声，不参与判定) */
export function pingzeOf(char: string): Pingze | null {
  const e = CHAR_MAP.get(char);
  if (!e) return null;
  if (e[0] === 1 || e[0] === 2) return '平';
  if (e[0] === 3 || e[0] === 4) return '仄';
  return null; // 轻声：平仄存疑，宽容不参与
}

/** 单字韵部名（如「十唐」），未收录返回 null */
export function rhymeOf(char: string): string | null {
  const e = CHAR_MAP.get(char);
  return e ? RHYMES[e[1] - 1] : null;
}

/** 由体裁参数推断校验形式：词走 cipai，诗按句数/句长区分 */
export function meterFormFor(shape: number[], genre: '诗' | '词'): MeterForm {
  if (genre === '词') return 'cipai';
  if (shape.length === 8) return 'lvshi7';
  return shape[0] === 5 ? 'jueju5' : 'jueju7';
}

/** 把报告压缩成可注入重写 prompt 的违规摘要（限长，避免提示词膨胀） */
export function summarizeMeter(report: MeterReport, maxLen = 200): string {
  const parts: string[] = [];
  report.lines.forEach((l, i) => {
    for (const issue of l.issues) parts.push(`第${i + 1}句${issue}`);
  });
  let s = parts.join('；');
  if (s.length > maxLen) s = s.slice(0, maxLen) + '…';
  return s || '格律不合';
}

/**
 * 格律校验入口。
 * @param lines 逐句文本（可带句末标点，内部剔除）
 * @param form  jueju5/jueju7/lvshi7/cipai
 * @param cipai cipai 时指定词牌（浣溪沙/定风波）；缺省按句数推断
 */
export function checkMeter(lines: string[], form: MeterForm, cipai?: string): MeterReport {
  const unknown = new Set<string>();
  const reports: LineReport[] = lines.map((raw) => {
    const text = (raw || '').replace(STRIP_RE, '');
    const chars = Array.from(text);
    const pingze = chars.map((c): Pingze | '?' => {
      const p = pingzeOf(c);
      if (p === null) {
        // 区分「未收录」与「轻声」：轻声在表内只是不判平仄，不计入未收录
        if (!CHAR_MAP.has(c)) unknown.add(c);
        return '?';
      }
      return p;
    });
    const last = chars[chars.length - 1] || '';
    return { text, pingze, rhymeChar: last, rhymeGroup: last ? rhymeOf(last) : null, issues: [] };
  });

  const isCi = form === 'cipai';
  const rhymeOk = isCi ? checkCiRhyme(reports, cipai) : checkShiRhyme(reports);
  const pingzeOk = isCi ? true : checkShiPingze(reports);

  return {
    pass: rhymeOk && pingzeOk,
    rhymeOk,
    pingzeOk,
    lines: reports,
    unknownChars: Array.from(unknown),
  };
}

/** 律绝押韵：偶数句末字同韵部即过；首句入韵与否宽容不查；已知韵脚不足两个时宽容通过 */
function checkShiRhyme(reports: LineReport[]): boolean {
  const known = reports
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => i % 2 === 1 && l.rhymeGroup);
  if (known.length < 2) return true;
  const main = known[0].l.rhymeGroup!;
  let ok = true;
  for (const { l } of known.slice(1)) {
    if (l.rhymeGroup !== main) {
      l.issues.push(`末字「${l.rhymeChar}」属${l.rhymeGroup}，与主韵部（${main}）不一致，押韵不合`);
      ok = false;
    }
  }
  return ok;
}

/**
 * 律绝平仄：
 *  硬规则——偶数句末字平声、奇数句（首句除外）末字仄声（近体诗押平韵的骨架，违规即判负）；
 *  软规则——句内第 2、4（、6）字平仄交替，违规数过半才判负（容忍古绝与拗救）。
 */
function checkShiPingze(reports: LineReport[]): boolean {
  let hardViol = 0;
  let altChecks = 0;
  let altViol = 0;

  reports.forEach((l, i) => {
    const lastPz = l.pingze[l.pingze.length - 1];
    if (lastPz && lastPz !== '?') {
      if (i % 2 === 1 && lastPz !== '平') {
        l.issues.push(`末字「${l.rhymeChar}」为仄声，偶数句押平韵须以平声收尾`);
        hardViol++;
      } else if (i % 2 === 0 && i > 0 && lastPz !== '仄') {
        l.issues.push(`末字「${l.rhymeChar}」为平声，奇数句（首句除外）须以仄声收尾`);
        hardViol++;
      }
      // 首句（i===0）入韵与否宽容，不查末字
    }
    // 二四六分明：第 2、4（、6）字逐对交替（未知/轻声字跳过，一三五不论）
    const keyPos = l.pingze.length >= 7 ? [1, 3, 5] : l.pingze.length >= 5 ? [1, 3] : [];
    for (let k = 0; k + 1 < keyPos.length; k++) {
      const a = l.pingze[keyPos[k]];
      const b = l.pingze[keyPos[k + 1]];
      if (a === '?' || b === '?') continue;
      altChecks++;
      if (a === b) {
        l.issues.push(`第${keyPos[k] + 1}、${keyPos[k + 1] + 1}字平仄未交替（均为${a}声）`);
        altViol++;
      }
    }
  });

  return hardViol === 0 && altViol <= Math.floor(altChecks / 2);
}

/**
 * 词押韵（不校验平仄——词谱平仄逐牌而异，如《定风波》平仄韵错叶，
 * 逐字平仄校验属后续精度空间，此处只把守韵脚）。
 *  浣溪沙：第 2、3、6 句末字同韵部（平韵）；
 *  定风波：主押韵句（第 1、2、5、8、11 句）末字韵部一致率 ≥ 60% 即过
 *         （该牌平韵为主、间叶仄韵，宽以多数一致为准）；
 *  其他/未知词牌：退化为偶数句同韵部的宽松检查。
 */
function checkCiRhyme(reports: LineReport[], cipai?: string): boolean {
  const name = cipai || (reports.length === 11 ? '定风波' : reports.length === 6 ? '浣溪沙' : '');
  if (name === '浣溪沙') {
    return requireSameGroup(reports, [1, 2, 5]);
  }
  if (name === '定风波') {
    const idx = [0, 1, 4, 7, 10].filter((i) => i < reports.length && reports[i].rhymeGroup);
    if (idx.length < 2) return true; // 已知韵脚不足，宽容通过
    const count = new Map<string, number>();
    for (const i of idx) count.set(reports[i].rhymeGroup!, (count.get(reports[i].rhymeGroup!) || 0) + 1);
    const [main, max] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    let ok = true;
    if (max / idx.length < 0.6) ok = false;
    for (const i of idx) {
      const l = reports[i];
      if (l.rhymeGroup !== main) {
        l.issues.push(`韵脚「${l.rhymeChar}」属${l.rhymeGroup}，与《定风波》主韵部（${main}）不一致`);
      }
    }
    return ok;
  }
  return checkShiRhyme(reports);
}

/** 指定句位（0-based）末字同韵部；已知不足两个时宽容通过 */
function requireSameGroup(reports: LineReport[], positions: number[]): boolean {
  const known = positions.filter((i) => i < reports.length && reports[i].rhymeGroup);
  if (known.length < 2) return true;
  const main = reports[known[0]].rhymeGroup!;
  let ok = true;
  for (const i of known.slice(1)) {
    const l = reports[i];
    if (l.rhymeGroup !== main) {
      l.issues.push(`韵脚「${l.rhymeChar}」属${l.rhymeGroup}，与韵部（${main}）不一致，押韵不合`);
      ok = false;
    }
  }
  return ok;
}
