/** 引用硬约束校验：答案中《诗题》必须在检索列表内（排除本诗），返回合规/越界统计 */
export interface CiteStat {
  total: number;
  valid: string[];
  invalid: string[];
}

export function checkCitations(text: string, ownTitle: string, retrieved: string[]): CiteStat {
  const found = [...text.matchAll(/《([^《》\n]{1,20})》/g)].map((m) => m[1].trim());
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const t of found) {
    if (t === ownTitle) continue;
    (retrieved.includes(t) ? valid : invalid).push(t);
  }
  return { total: valid.length + invalid.length, valid, invalid };
}
