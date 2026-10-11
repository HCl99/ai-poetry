# -*- coding: utf-8 -*-
"""端到端验证：登录 -> /api/annotation -> /api/transfer"""
import json
import sys

import requests

BASE = 'http://localhost:3000'
EMAIL = 'test@poetry.ai'
PASSWORD = 'test123456'

s = requests.Session()

# 1. CSRF
r = s.get(f'{BASE}/api/auth/csrf', timeout=15)
print('1. csrf:', r.status_code)
if r.status_code != 200:
    print(r.text[:300]); sys.exit(1)
csrf = r.json()['csrfToken']

# 2. 登录
r = s.post(
    f'{BASE}/api/auth/callback/credentials',
    data={'email': EMAIL, 'password': PASSWORD, 'csrfToken': csrf,
          'callbackUrl': f'{BASE}/workbench', 'json': 'true'},
    timeout=30, allow_redirects=False)
print('2. login:', r.status_code)

# 3. 会话确认
r = s.get(f'{BASE}/api/auth/session', timeout=15)
sess = r.json()
print('3. session user:', json.dumps(sess.get('user'), ensure_ascii=False))
if not sess.get('user'):
    print('LOGIN FAILED -> 用户可能不存在或密码错误')
    sys.exit(1)

# 4. AI 注解
poem_id = 'e72db286-3b6a-425b-ad02-75248ea5a790'
r = s.post(f'{BASE}/api/annotation', json={'poemId': poem_id}, timeout=120)
print('4. annotation:', r.status_code)
if r.status_code == 200:
    d = r.json()
    for dim in d.get('dimensions', []):
        content = (dim.get('content') or '')[:50].replace('\n', ' ')
        print(f"   - {dim.get('dimension')}: {content}")
    print('   citations:', len(d.get('dimensions', [{}])[0].get('citations', []) if d.get('dimensions') else []))
    print('   related:', len(d.get('related') or []),
          '| hasBio:', d.get('hasBio'),
          '| model:', d.get('model'),
          '| latencyMs:', d.get('latencyMs'))
else:
    print(json.dumps(r.json(), ensure_ascii=False)[:600])

# 5. 风格迁移
r = s.post(f'{BASE}/api/transfer',
           json={'text': '下雨天一个人走回家，路上想起了远方的朋友', 'style': 'libai'},
           timeout=120)
print('5. transfer(libai):', r.status_code)
if r.status_code == 200:
    d = r.json()
    print('   poem:', (d.get('poem') or '').replace('\n', ' / '))
    print('   form:', d.get('form'), '| model:', d.get('model'), '| latencyMs:', d.get('latencyMs'))
else:
    print(json.dumps(r.json(), ensure_ascii=False)[:600])
