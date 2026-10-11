# -*- coding: utf-8 -*-
"""smoke_embed.py - 冒烟测试：embedding-3 单批耗时与可用性"""
import json
import os
import time

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            cfg[k.strip()] = v

url = cfg.get("ZHIPUAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4").rstrip("/") + "/embeddings"
texts = [f"测试诗句{i}：明月松间照，清泉石上流" for i in range(32)]
t0 = time.time()
r = requests.post(
    url,
    headers={"Authorization": f"Bearer {cfg['ZHIPUAI_API_KEY']}"},
    json={"model": "embedding-3", "input": texts, "dimensions": 512},
    timeout=60,
)
el = time.time() - t0
print("HTTP", r.status_code, f"{el:.2f}s")
if r.status_code == 200:
    d = r.json()["data"]
    print("向量数:", len(d), "维度:", len(d[0]["embedding"]))
else:
    print(r.text[:300])
