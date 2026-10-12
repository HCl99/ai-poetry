# -*- coding: utf-8 -*-
"""e2e_hybrid_test.py - 混合检索（向量0.7+关键词0.3）人名/地名召回验证
选题：标题含地名/人名的诗，观察 RAG 检索结果中是否召回同地名/同人名诗篇
为节省时间，meta 事件（检索结果）到达后即关闭连接，不等待 LLM 生成
"""
import json
import os
import sys

import pymysql
import requests

BASE = 'http://localhost:3000'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

cfg = {}
with open(os.path.join(ROOT, '.env'), encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            cfg[k.strip()] = v

s = requests.Session()
r = s.get(f'{BASE}/api/auth/csrf', timeout=15)
csrf = r.json()['csrfToken']
s.post(f'{BASE}/api/auth/callback/credentials',
       data={'email': 'test@poetry.ai', 'password': 'test123456', 'csrfToken': csrf,
             'callbackUrl': f'{BASE}/workbench', 'json': 'true'},
       timeout=30, allow_redirects=False)
r = s.get(f'{BASE}/api/auth/session', timeout=15)
if not r.json().get('user'):
    print('LOGIN FAILED')
    sys.exit(1)
print('[OK] 登录成功')

conn = pymysql.connect(host=cfg['MYSQL_HOST'], port=int(cfg['MYSQL_PORT']),
                       user=cfg['MYSQL_USER'], password=cfg['MYSQL_PASSWORD'],
                       database=cfg['MYSQL_DATABASE'], charset='utf8mb4')

# 标题含地名/人名的测试样本（每类取一首有代表性的）
samples = []
with conn.cursor() as cur:
    for kw in ['黄鹤楼', '庐山', '岳阳楼', '昭君']:
        cur.execute(
            "SELECT id, title, author FROM poems WHERE title LIKE %s AND CHAR_LENGTH(COALESCE(paragraphs_simp,''))>20 LIMIT 1",
            (f'%{kw}%',))
        row = cur.fetchone()
        if row:
            samples.append(row)
conn.close()
print(f'[sample] {len(samples)} 首人名/地名样本: {[(t, a) for _, t, a in samples]}\n')


def read_sse(resp):
    event, data = None, None
    for raw in resp.iter_lines(decode_unicode=True):
        if not raw:
            if event:
                yield event, data
            event, data = None, None
            continue
        if raw.startswith('event:'):
            event = raw[6:].strip()
        elif raw.startswith('data:'):
            data = raw[5:].strip()
    if event:
        yield event, data


for pid, title, author in samples:
    r = s.post(f'{BASE}/api/annotation', json={'poemId': pid}, stream=True, timeout=120)
    if r.status_code != 200:
        print(f'《{title}》 HTTP {r.status_code}')
        continue
    print(f'=== 《{title}》{author} ===')
    for event, data in read_sse(r):
        d = json.loads(data) if data else {}
        if event == 'meta':
            rel = d.get('related') or []
            for x in rel:
                print(f"  检索命中: 《{x.get('title')}》 {x.get('author')} 融合分={x.get('score')}")
            r.close()  # 拿到检索结果即断开，不等生成
            break
        if event == 'error':
            print('  [ERROR]', d)
            break
    print()

print('[DONE] 混合检索验证完成')
