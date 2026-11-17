/** 标点字符集（计字数时剔除） */
const PUNCT_RE = /[，。！？；：、（）「」『』《》〈〉〔〕【】·\s]/g;

/**
 * 把库中存储的诗行按句读拆成「句」。
 * 关键：语料库多为「两句一行」（如杜甫七律存成 4 行 × 14 字），
 * 若直接用 `lines.length` 当作句数，会把七律误判为 4 句（绝句），
 * 导致「范例体裁与目标不符 → 模型照抄错句式 → 对不上号」。必须先拆句。
 */
export function toSentences(lines: string[]): string[] {
  const out: string[] = [];
  for (const ln of lines) {
    const t = (ln || '').trim();
    if (!t) continue;
    const parts = t.match(/[^，。！？；、]*[，。！？；、]|[^，。！？；、]+$/g) || [t];
    for (const p of parts) {
      const q = p.trim();
      if (q) out.push(q);
    }
  }
  return out;
}

/** 句式指纹：逐句「不计标点的字数」用逗号连接，如七律为 "7,7,7,7,7,7,7,7"、定风波为 "7,7,7,2,7,7,2,7,7,2,7" */
export function shapeOf(sents: string[]): string {
  return sents.map((x) => x.replace(PUNCT_RE, '').length).join(',');
}

/**
 * 规整生成结果的版式，保证「风格 ↔ 体裁」对得上号：
 *  1) 把挤在同一行的多句按句末标点拆开，做到「一句一行」；
 *  2) 词作首行补上词牌名，并与正文之间留一空行；
 *  3) 词作上下阕之间留一空行。
 * 模型（glm-4-flash）常不按提示换行或漏写词牌名，此处做确定性兜底。
 */
export function normalizePoem(
  raw: string,
  s: { genre: '诗' | '词'; cipai?: string; blankAfter?: number },
): string {
  const seg: string[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.match(/[^，。！？；、]*[，。！？；、]|[^，。！？；、]+$/g) || [t];
    for (const p of parts) {
      const q = p.trim();
      if (q) seg.push(q);
    }
  }
  let head = 0;
  if (s.genre === '词' && s.cipai) {
    const bare = (x: string) => x.replace(/[《》〈〉〔〕[\]·\s]/g, '');
    if (seg.length && (bare(seg[0]) === s.cipai || bare(seg[0]).startsWith(s.cipai))) seg.shift();
    seg.unshift(s.cipai);
    head = 1;
  }
  const out: string[] = [];
  let sent = 0;
  seg.forEach((l, i) => {
    // 词牌名与正文之间空一行（仅词体；诗体 head=0，不能误插首行空行）
    if (s.genre === '词' && i === head) out.push('');
    if (s.blankAfter && i === head + s.blankAfter) out.push(''); // 上下阕之间
    let x = l;
    // 诗体：模型偶有漏写行末标点，按近体诗惯例补（奇句收「，」、偶句收「。」）
    if (s.genre === '诗' && !/[，。！？；、]$/.test(x)) x += sent % 2 === 0 ? '，' : '。';
    sent++;
    out.push(x);
  });
  return out.join('\n');
}
