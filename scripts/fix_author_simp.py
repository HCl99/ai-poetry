"""把库内作者名、诗题统一转成简体，并同步向量元数据。

背景：宋诗原库（chinese-poetry）作者名多为繁体（楊萬里、陸游、蘇軾），
早期入库脚本只转换了正文（paragraphs_simp）与诗题，作者名被原样写入，
导致前端展示「楊萬里」这类用户看不懂的繁体。此脚本做一次性回填，可重复执行。
"""
import json
import pathlib
import re
from urllib.parse import unquote

import pymysql
from opencc import OpenCC

ROOT = pathlib.Path(__file__).resolve().parent.parent
cc = OpenCC('t2s')


def connect():
    url = None
    for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
        if line.startswith('DATABASE_URL'):
            url = line.split('=', 1)[1].strip().strip('"').strip("'")
            break
    m = re.match(r'mysql://([^:]+):([^@]*)@([^:/]+):(\d+)/([^?]+)', url)
    return pymysql.connect(host=m.group(3), port=int(m.group(4)), user=m.group(1),
                           password=unquote(m.group(2)), database=m.group(5), charset='utf8mb4')


def fix_column(cur, column):
    cur.execute(f"SELECT DISTINCT {column} FROM poems")
    values = [r[0] for r in cur.fetchall() if r[0]]
    changed = [(v, cc.convert(v)) for v in values if cc.convert(v) != v]
    for old, new in changed:
        cur.execute(f"UPDATE poems SET {column}=%s WHERE {column}=%s", (new, old))
    return len(changed), len(values)


def main():
    conn = connect()
    cur = conn.cursor()
    na, total_a = fix_column(cur, 'author')
    nt, total_t = fix_column(cur, 'title')
    conn.commit()
    print(f'author: {na}/{total_a} 个名字转为简体')
    print(f'title : {nt}/{total_t} 个诗题转为简体')
    cur.execute("SELECT COUNT(DISTINCT author) FROM poems")
    print('转换后作者数', cur.fetchone()[0])
    conn.close()

    # 向量元数据里也存了作者名，一并转换，避免检索时按简体名匹配不到
    meta_path = ROOT / 'data' / 'vectors.meta.json'
    if meta_path.exists():
        data = json.loads(meta_path.read_text(encoding='utf-8'))
        n = 0
        for m in data.get('meta', {}).values():
            a = m.get('author')
            if a and cc.convert(a) != a:
                m['author'] = cc.convert(a)
                n += 1
        meta_path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        print(f'vectors.meta.json: {n} 条作者名转为简体')


if __name__ == '__main__':
    main()
