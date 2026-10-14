# -*- coding: utf-8 -*-
"""语料标点/标题质量修复（幂等，可重复执行）

背景：全唐诗/全宋诗/全元曲导入库中标点存在系统性瑕疵，影响「宋元词曲被读成唐诗」的观感：
  1) 标题中的日文中点 ・(U+30FB) 应为中文间隔点 ·(U+00B7)；
  2) 标题内含 2 个及以上空格，或首尾含空白；
  3) 标题以句读结尾（如「赠雷殿直。」）；
  4) 正文行末被导入器追加的句号（前一字符已是 ？！，；：、 时），如「悲夫！。」「何日更逢明？。」；
  5) 连续重复标点（，，／、、）、「，、」误用、？！ 后紧跟「，」；
  6) 正文中 ASCII 半角 ?!.,;: 紧跟汉字（应为全角）；
  7) 正文中混入的 HTTP 响应头抓取垃圾行；
  8) 占位条目「空。」（原书未收录正文）。

用法：python scripts/fix_corpus_punct.py
     （连接参数取自下方常量，与 scripts/db_check.py 保持一致）
"""
import json
import re
import pymysql

DB = dict(host='127.0.0.1', user='root', password='REDACTED_DB_PASSWORD',
          database='ai_poetry', charset='utf8mb4')

TRAIL = '？！，；：、'
_DUP = re.compile(r'([？！，；：、])\1+')
_HALF = re.compile(r'(?<=[\u4e00-\u9fff])([?!:,;])')
_HALF_MAP = {'?': '？', '!': '！', ':': '：', ',': '，', ';': '；'}
_CAP_COMMA = re.compile(r'([？！])，')
_COMMA_DUN = re.compile(r'，、')
_TAIL_JUNK = re.compile(r'\(\?。$')
_JUNK_KEYS = ('Connection=[', 'Content-Type=[', 'Last-Modified=[',
              'Accept-Ranges=[', 'Server=[', 'Alt-Svc=[', '中国诗歌库')


def fix_line(s: str) -> str:
    s = s.rstrip()                                   # 去尾部空白（含全角空格）
    while len(s) >= 2 and s[-1] == '。' and s[-2] in TRAIL:
        s = s[:-1]                                   # 剥除被追加的句号
    s = _TAIL_JUNK.sub('', s)                        # 元杂剧导入残迹 (?。
    s = _CAP_COMMA.sub(r'\1', s)                     # ？！， → ？！
    s = _COMMA_DUN.sub('，', s)                      # ，、 → ，
    s = _DUP.sub(r'\1', s)                           # ，， → ，
    s = _HALF.sub(lambda m: _HALF_MAP[m.group(1)], s)  # 半角 → 全角
    return s


def fix_arr(arr):
    changed = False
    out = []
    for x in arr:
        x = str(x)
        if any(k in x for k in _JUNK_KEYS):
            changed = True
            continue
        y = fix_line(x)
        if y != x:
            changed = True
        out.append(y)
    return out, changed


def main():
    conn = pymysql.connect(**DB)
    w = conn.cursor()

    w.execute("UPDATE poems SET title = REPLACE(title, '・', '·') WHERE title LIKE '%・%'")
    print('标题 日文中点→间隔点:', w.rowcount)
    w.execute("UPDATE poems SET title = TRIM(REGEXP_REPLACE(title, '[[:space:]]+', ' ')) "
              "WHERE title REGEXP '[[:space:]]{2,}' OR title <> TRIM(title)")
    print('标题 空白折叠/去首尾:', w.rowcount)
    w.execute("UPDATE poems SET title = TRIM(REGEXP_REPLACE(title, '[，。！？；、]+$', '')) "
              "WHERE title REGEXP '[，。！？；、]$'")
    print('标题 去尾部句读:', w.rowcount)
    conn.commit()
    w.close()

    from pymysql.cursors import SSCursor
    r = conn.cursor(SSCursor)
    r.execute("SELECT id, paragraphs, paragraphs_simp FROM poems")
    updates = []
    for pid, para, psimp in r:
        arr = json.loads(para) if isinstance(para, str) else para
        arr = [str(x) for x in (arr if isinstance(arr, list) else [arr])]
        sarr = None
        if psimp is not None:
            sarr = json.loads(psimp) if isinstance(psimp, str) else psimp
            sarr = [str(x) for x in (sarr if isinstance(sarr, list) else [sarr])]
        na, c1 = fix_arr(arr)
        if sarr is not None:
            ns, c2 = fix_arr(sarr)
        else:
            ns, c2 = None, False
        if len(na) == 1 and na[0].strip() in ('空', '', '无'):
            na, c1 = ['（原诗未收录）'], True
        if ns is not None and len(ns) == 1 and ns[0].strip() in ('空', '', '无'):
            ns, c2 = ['（原诗未收录）'], True
        if c1 or c2:
            updates.append((json.dumps(na, ensure_ascii=False),
                            json.dumps(ns, ensure_ascii=False) if ns is not None else None, pid))
    r.close()

    w = conn.cursor()
    for par, spar, pid in updates:
        if spar is None:
            w.execute("UPDATE poems SET paragraphs = CAST(%s AS JSON) WHERE id=%s", (par, pid))
        else:
            w.execute("UPDATE poems SET paragraphs = CAST(%s AS JSON), paragraphs_simp = CAST(%s AS JSON) WHERE id=%s",
                      (par, spar, pid))
    conn.commit()
    print('正文标点修正行数:', len(updates))

    for label, sql in [
        ('标题仍在句读结尾', "SELECT COUNT(*) FROM poems WHERE title REGEXP '[，。！？；、]$'"),
        ('标题仍含日文中点', "SELECT COUNT(*) FROM poems WHERE title LIKE '%・%'"),
        ('正文含占位空条目', "SELECT COUNT(*) FROM poems WHERE CAST(paragraphs AS CHAR) LIKE '%\"空。\"%'"),
    ]:
        w.execute(sql)
        print(f'  复检 {label}: {w.fetchone()[0]}')
    conn.close()


if __name__ == '__main__':
    main()
