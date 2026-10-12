# -*- coding: utf-8 -*-
"""RAG 评测面板 API 实测：登录 → POST /api/rag-eval → 解析 SSE 事件"""
import json
import re
import sys

import requests

BASE = "http://localhost:3000"


def login(s: requests.Session) -> bool:
    r = s.get(f"{BASE}/api/auth/csrf")
    token = r.json().get("csrfToken")
    r = s.post(
        f"{BASE}/api/auth/callback/credentials",
        data={"csrfToken": token, "email": "test@poetry.ai", "password": "test123456"},
        allow_redirects=False,
    )
    return r.status_code in (200, 302)


def parse_sse(text: str):
    events = []
    for block in text.split("\n\n"):
        ev, data = None, None
        for line in block.splitlines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:"):
                data = line[5:].strip()
        if ev and data:
            try:
                events.append((ev, json.loads(data)))
            except json.JSONDecodeError:
                events.append((ev, data))
    return events


def main():
    s = requests.Session()
    assert login(s), "登录失败"
    print("[1] 登录 OK")

    r = s.post(f"{BASE}/api/rag-eval", json={"sampleSize": 3}, timeout=300)
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text[:300]}"
    events = parse_sse(r.text)
    kinds = [e for e, _ in events]
    print(f"[2] SSE 事件序列: {kinds}")

    meta = next((d for e, d in events if e == "meta"), None)
    samples = [d for e, d in events if e == "sample"]
    done = next((d for e, d in events if e == "done"), None)

    assert meta, "缺少 meta 事件"
    print(f"[3] meta: 计划样本 {meta.get('total')} · {[x['title'] for x in meta.get('samples', [])]}")

    assert len(samples) == 3, f"sample 事件数 {len(samples)} != 3"
    for smp in samples:
        print(
            f"    样本{smp['i']}: 《{smp['title']}》 延迟{smp['latencyMs']}ms "
            f"引用 {smp['valid']}/{smp['cites']} 累计归因率 {smp['cumRate']}%"
            + (f" 越界:{smp['invalid']}" if smp.get("invalid") else "")
        )

    assert done, "缺少 done 事件"
    print(
        f"[4] done: 样本 {done['samples']} · 引用总数 {done['totalCites']} · "
        f"归因率 {done['rate']}% · 平均延迟 {done['avgLatencyMs']}ms"
    )
    assert 0 <= done["rate"] <= 100, "归因率越界"
    assert done["samples"] == 3

    # 越界样本量应被收敛到 2-8（流式读取首个 meta 后即断开，不跑完整评测）
    r2 = s.post(f"{BASE}/api/rag-eval", json={"sampleSize": 99}, stream=True, timeout=30)
    head = b""
    for chunk in r2.iter_content(chunk_size=1024):
        head += chunk
        if b"event: meta" in head:
            break
    r2.close()
    m2 = re.search(rb"event: meta\ndata: (\{[^\n]*\})", head)
    meta2 = json.loads(m2.group(1)) if m2 else {}
    assert r2.status_code == 200 and meta2.get("total") == 8, f"sampleSize=99 未收敛为 8: {meta2}"
    print(f"[5] 越界 sampleSize=99 → 收敛为 {meta2.get('total')} 个样本（夹取 2-8）OK")

    print("\n全部断言通过")


if __name__ == "__main__":
    sys.exit(main())
