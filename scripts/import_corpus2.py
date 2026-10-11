# -*- coding: utf-8 -*-
"""补充导入：五代诗词(子目录)、纳兰性德、曹操诗集"""
import json
from pathlib import Path

import pymysql
from opencc import OpenCC

ROOT = Path(r'c:\Users\Lenovo\Desktop\传智杯\chinese-poetry-master')
cc = OpenCC('t2s')

conn = pymysql.connect(host='127.0.0.1', user='root', password='REDACTED_DB_PASSWORD',
                       database='ai_poetry', charset='utf8mb4', autocommit=False)
cur = conn.cursor()

cur.execute("SELECT author, paragraphs_simp FROM poems")
seen = set()
for author, ps in cur.fetchall():
    if isinstance(ps, str):
        try:
            ps = json.loads(ps)
        except Exception:
            ps = []
    first = (ps[0] if isinstance(ps, list) and ps else '')[:18]
    seen.add((author, first))
print(f'去重基线: {len(seen)}')

SQL = ("INSERT INTO poems (id, title, author, dynasty, paragraphs, paragraphs_simp, tags, source_file, created_at) "
       "VALUES (UUID(), %s, %s, %s, %s, %s, %s, %s, NOW())")
batch = []
counts = {'五代诗词': 0, '纳兰性德': 0, '曹操诗集': 0}
current = ''


def flush():
    global batch
    if batch:
        cur.executemany(SQL, batch)
        conn.commit()
        batch = []


def add(title, author, dynasty, paragraphs, tags, source):
    author = (author or '').strip() or '佚名'
    ps_simp = [cc.convert(p) for p in paragraphs if p]
    if not ps_simp:
        return
    key = (author, ps_simp[0][:18])
    if key in seen:
        return
    seen.add(key)
    counts[current] += 1
    batch.append((cc.convert(title or ''), author, dynasty,
                  json.dumps(paragraphs, ensure_ascii=False),
                  json.dumps(ps_simp, ensure_ascii=False),
                  json.dumps([t for t in tags if t], ensure_ascii=False), source))
    if len(batch) >= 2000:
        flush()


def load(p: Path):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


current = '五代诗词'
files = sorted((ROOT / '五代诗词').rglob('huajianji-*-juan.json')) + sorted((ROOT / '五代诗词').rglob('poetrys.json'))
print('五代诗词文件:', [p.name for p in files])
for p in files:
    tag = '花间集' if 'huajianji' in p.name else '五代诗词'
    for it in load(p):
        add(it.get('title') or '词', it.get('author'), '五代',
            it.get('paragraphs') or [], [tag, it.get('collection') or ''], f'五代诗词/{p.parent.name}/{p.name}')
flush()

current = '纳兰性德'
for it in load(ROOT / '纳兰性德/纳兰性德诗集.json'):
    add(it.get('title') or '词', it.get('author') or '纳兰性德', '清',
        it.get('para') or it.get('paragraphs') or [], ['纳兰词'], '纳兰性德/纳兰性德诗集.json')
flush()

current = '曹操诗集'
for it in load(ROOT / '曹操诗集/caocao.json'):
    add(it.get('title') or '诗', '曹操', '汉魏',
        it.get('paragraphs') or [], ['曹操诗集'], '曹操诗集/caocao.json')
flush()

print('\n=== 补充导入完成 ===')
for k, v in counts.items():
    print(f'  {k}: +{v}')
cur.execute("SELECT dynasty, COUNT(*) FROM poems GROUP BY dynasty ORDER BY 2 DESC")
total = 0
for d, c in cur.fetchall():
    total += c
    print(f'  {d}: {c}')
print(f'  总计: {total}')
conn.close()
