/** 每日一诗：按日期字符串散列，当日固定、隔日轮换 */
export function dayIndexOf(total: number): number {
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % Math.max(total, 1);
  return h;
}
