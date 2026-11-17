# -*- coding: utf-8 -*-
import os
from pathlib import Path as _Path

def _load_project_env():
    _p = _Path(__file__).resolve().parent.parent / ".env"
    if not _p.exists():
        return
    for _line in _p.read_text(encoding="utf-8", errors="ignore").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

_load_project_env()
"""全面导入 chinese-poetry-master 剩余诗词数据到 MySQL ai_poetry.poems

导入集合:
  宋词 ci.song.*.json + 宋词三百首.json   -> 宋
  宋诗 poet.song.*.json (繁转简)          -> 宋
  元曲 yuanqu.json                        -> 元
  诗经 shijing.json / 楚辞 chuci.json     -> 先秦
  五代诗词 huajianji-* + poetrys.json     -> 五代
  纳兰性德诗集.json                       -> 清
  曹操诗集 caocao.json                    -> 汉魏
"""
import json
from pathlib import Path

import pymysql
from opencc import OpenCC

ROOT = Path(r'c:\Users\Lenovo\Desktop\传智杯\chinese-poetry-master')
cc = OpenCC('t2s')

conn = pymysql.connect(host='127.0.0.1', user='root', password=os.getenv("MYSQL_PASSWORD", ""),
                       database='ai_poetry', charset='utf8mb4', autocommit=False)
cur = conn.cursor()

# 已有数据去重键: (author, 简体首句前18字)
cur.execute("SELECT author, paragraphs_simp FROM poems")
seen = set()
for author, ps in cur.fetchall():
    first = (ps[0] if isinstance(ps, list) and ps else '')[:18]
    seen.add((author, first))
print(f'现有 poems 作为去重基线: {len(seen)}')

SQL = ("INSERT INTO poems (id, title, author, dynasty, paragraphs, paragraphs_simp, tags, source_file, created_at) "
       "VALUES (UUID(), %s, %s, %s, %s, %s, %s, %s, NOW())")

stats = {}
batch = []


def t2s(text):
    return cc.convert(text) if text else text


def flush(force=False):
    global batch
    if not batch:
        return
    if force or len(batch) >= 2000:
        cur.executemany(SQL, batch)
        conn.commit()
        batch = []


def add(title, author, dynasty, paragraphs, tags, source):
    # 作者名同样转简体：宋诗原库作者多为繁体（楊萬里、陸游），直接入库会让用户看不懂
    author = t2s((author or '').strip()) or '佚名'
    ps_simp = [t2s(p) for p in paragraphs if p]
    if not ps_simp:
        return 0
    key = (author, ps_simp[0][:18])
    if key in seen:
        return 0
    seen.add(key)
    tags = [t for t in tags if t]
    batch.append((t2s(title or ''), author, dynasty,
                  json.dumps(paragraphs, ensure_ascii=False),
                  json.dumps(ps_simp, ensure_ascii=False),
                  json.dumps(tags, ensure_ascii=False), source))
    flush()
    return 1


def load(rel):
    with open(ROOT / rel, encoding='utf-8') as f:
        return json.load(f)


def run(name, fn):
    before = sum(stats.values())
    fn()
    stats[name] = sum(stats.values()) - before
    flush(force=True)
    print(f'  {name}: +{stats[name]}')


# 1. 宋词三百首（先导，保证带标签）
def imp_songci300():
    for it in load('宋词/宋词三百首.json'):
        add(it.get('rhythmic') or it.get('title') or '词', it.get('author'), '宋',
            it.get('paragraphs') or [], ['宋词', '宋词三百首'], '宋词/宋词三百首.json')
run('宋词三百首', imp_songci300)

# 2. 宋词 ci.song.*
def imp_songci():
    files = sorted((ROOT / '宋词').glob('ci.song.*.json'))
    for p in files:
        for it in load(f'宋词/{p.name}'):
            add(it.get('rhythmic') or '词', it.get('author'), '宋',
                it.get('paragraphs') or [], ['宋词'], f'宋词/{p.name}')
run('宋词', imp_songci)

# 3. 宋诗 poet.song.*（繁转简）
def imp_songshi():
    files = sorted((ROOT / '全唐诗').glob('poet.song.*.json'))
    print(f'  宋诗分片: {len(files)} 个')
    for p in files:
        for it in load(f'全唐诗/{p.name}'):
            add(it.get('title') or '诗', it.get('author'), '宋',
                it.get('paragraphs') or [], ['宋诗'], f'全唐诗/{p.name}')
run('宋诗', imp_songshi)

# 4. 元曲
def imp_yuanqu():
    for it in load('元曲/yuanqu.json'):
        add(it.get('title') or '曲', it.get('author'), '元',
            it.get('paragraphs') or [], ['元曲'], '元曲/yuanqu.json')
run('元曲', imp_yuanqu)

# 5. 诗经
def imp_shijing():
    for it in load('诗经/shijing.json'):
        tags = ['诗经']
        if it.get('section'):
            tags.append(it['section'])
        add(it.get('title') or '诗', '佚名', '先秦',
            it.get('content') or [], tags, '诗经/shijing.json')
run('诗经', imp_shijing)

# 6. 楚辞
def imp_chuci():
    for it in load('楚辞/chuci.json'):
        add(it.get('title') or '辞', it.get('author'), '先秦',
            it.get('content') or [], ['楚辞', it.get('section') or ''], '楚辞/chuci.json')
run('楚辞', imp_chuci)

# 7. 五代诗词（花间集各卷 + poetrys）
def imp_wudai():
    for p in sorted((ROOT / '五代诗词').glob('huajianji-*-juan.json')):
        for it in load(f'五代诗词/{p.name}'):
            add(it.get('title') or '词', it.get('author'), '五代',
                it.get('paragraphs') or [], ['花间集'], f'五代诗词/{p.name}')
    for it in load('五代诗词/poetrys.json'):
        add(it.get('title') or '词', it.get('author'), '五代',
            it.get('paragraphs') or [], ['五代诗词'], '五代诗词/poetrys.json')
run('五代诗词', imp_wudai)

# 8. 纳兰性德
def imp_nalan():
    for it in load('纳兰性德/纳兰性德诗集.json'):
        add(it.get('title') or '词', it.get('author') or '纳兰性德', '清',
            it.get('para') or it.get('paragraphs') or [], ['纳兰词'], '纳兰性德/纳兰性德诗集.json')
run('纳兰性德', imp_nalan)

# 9. 曹操诗集
def imp_caocao():
    for it in load('曹操诗集/caocao.json'):
        add(it.get('title') or '诗', '曹操', '汉魏',
            it.get('paragraphs') or [], ['曹操诗集'], '曹操诗集/caocao.json')
run('曹操诗集', imp_caocao)

flush(force=True)

print('\n=== 导入完成 ===')
cur.execute("SELECT dynasty, COUNT(*) FROM poems GROUP BY dynasty ORDER BY 2 DESC")
total = 0
for d, c in cur.fetchall():
    total += c
    print(f'  {d}: {c}')
print(f'  总计: {total}')
conn.close()
