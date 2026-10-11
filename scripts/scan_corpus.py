# -*- coding: utf-8 -*-
"""扫描 chinese-poetry-master 各集合的 JSON 条目数"""
import json
import os
from pathlib import Path

ROOT = Path(r'c:\Users\Lenovo\Desktop\传智杯\chinese-poetry-master')

def count_file(p: Path):
    try:
        with open(p, encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, list):
            return len(data)
        return 1
    except Exception as e:
        return -1

for d in sorted(ROOT.iterdir()):
    if not d.is_dir() or d.name.startswith('.') or d.name in ('loader', 'rank', 'images', 'strains'):
        continue
    jsons = list(d.rglob('*.json'))
    total = 0
    detail = []
    for p in jsons:
        c = count_file(p)
        if c > 0:
            total += c
            detail.append((p.name, c))
    print(f'【{d.name}】 json文件 {len(jsons)} 个, 条目合计 {total}')
    for name, c in sorted(detail)[:6]:
        print(f'    {name}: {c}')
    if len(detail) > 6:
        print(f'    ... 其余 {len(detail)-6} 个文件')
