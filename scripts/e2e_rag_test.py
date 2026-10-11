# -*- coding: utf-8 -*-
"""e2e_rag_test.py - 端到端验证向量 RAG：登录 -> annotation SSE -> transfer SSE"""
import json
import sys

import requests

BASE = 'http://localhost:3000'
EMAIL = 'test@poetry.ai'
PASSWORD = 'test123456'

s = requests.Session()

r = s.get(f'{BASE}/api/auth/csrf', timeout=15)
csrf = r.json()['csrfToken']
r = s.post(f'{BASE}/api/auth/callback/credentials',
           data={'email': EMAIL, 'password': PASSWORD, 'csrfToken': csrf,
                 'callbackUrl': f'{BASE}/workbench', 'json': 'true'},
           timeout=30, allow_redirects=False)
r = s.get(f'{BASE}/api/auth/session', timeout=15)
if not r.json().get('user'):
    print('LOGIN FAILED'); sys.exit(1)
print('[OK] 登录成功')


def read_sse(resp):
    """解析 SSE 事件流"""
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


print('\n=== /api/annotation（向量 RAG） ===')
poem_id = 'e72db286-3b6a-425b-ad02-75248ea5a790'
r = s.post(f'{BASE}/api/annotation', json={'poemId': poem_id}, stream=True, timeout=120)
print('HTTP', r.status_code)
if r.status_code == 200:
    deltas = 0
    for event, data in read_sse(r):
        d = json.loads(data) if data else {}
        if event == 'step':
            print(f"  [step] {d.get('label')}: {d.get('detail')}")
        elif event == 'meta':
            rel = d.get('related') or []
            print(f"  [meta] related={len(rel)} scores={[x.get('score') for x in rel]} hasBio={d.get('hasBio')}")
        elif event == 'delta':
            deltas += 1
        elif event == 'done':
            dims = d.get('dimensions') or []
            print(f"  [done] deltas={deltas} dims={len(dims)} latencyMs={d.get('latencyMs')}")
            for dim in dims:
                print(f"    - {dim.get('tag')}: {(dim.get('content') or '')[:40]} | {dim.get('citation')}")
        elif event == 'error':
            print('  [ERROR]', d)

print('\n=== /api/transfer（风格范例检索） ===')
r = s.post(f'{BASE}/api/transfer',
           json={'text': '下雨天一个人走回家，路上想起了远方的朋友', 'style': 'libai'},
           stream=True, timeout=120)
print('HTTP', r.status_code)
if r.status_code == 200:
    poem_lines = []
    for event, data in read_sse(r):
        d = json.loads(data) if data else {}
        if event == 'step':
            print(f"  [step] {d.get('label')}: {d.get('detail')}")
        elif event == 'meta':
            print(f"  [meta] exemplars={d.get('exemplars')}")
        elif event == 'done':
            print(f"  [done] poem={d.get('poem', '').replace(chr(10), ' / ')}")
        elif event == 'error':
            print('  [ERROR]', d)
