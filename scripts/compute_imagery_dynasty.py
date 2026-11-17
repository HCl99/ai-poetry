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
"""一次性预计算：意象（当前 50 个）× 各朝代的「含该意象诗数」与例句 → data/imagery-dynasty.json
口径与 imagery.count 一致：一首诗任意句（简体正文）含该字即计 1。
"""
import json
import time

import pymysql

DYNASTY_ORDER = ["先秦", "汉魏", "唐", "五代", "宋", "元", "清"]


def main():
    t0 = time.time()
    conn = pymysql.connect(
        host="127.0.0.1", port=3306, user="root",
        password=os.getenv("MYSQL_PASSWORD", ""), database="ai_poetry", charset="utf8mb4",
    )
    cur = conn.cursor()

    cur.execute("SELECT `char` FROM imagery")
    chars = [r[0] for r in cur.fetchall()]
    print(f"意象字 {len(chars)} 个")

    # 各朝代诗数
    cur.execute("SELECT dynasty, COUNT(*) FROM poems GROUP BY dynasty")
    poem_totals = {r[0]: r[1] for r in cur.fetchall()}
    print("朝代诗数:", poem_totals)

    # 逐诗扫描：正文（简体优先）含字计数 + 采集例句
    cur.execute(
        "SELECT dynasty, title, author, "
        "COALESCE(paragraphs_simp, paragraphs) FROM poems"
    )
    matrix = {c: {d: 0 for d in DYNASTY_ORDER} for c in chars}
    examples = {c: {d: [] for d in DYNASTY_ORDER} for c in chars}
    n = 0
    for dynasty, title, author, paras in cur.fetchall():
        n += 1
        if n % 50000 == 0:
            print(f"  已扫描 {n} 首 · {time.time()-t0:.0f}s")
        if dynasty not in poem_totals or dynasty not in DYNASTY_ORDER:
            continue
        try:
            lines = json.loads(paras) if isinstance(paras, str) else paras
        except Exception:
            continue
        if not isinstance(lines, list):
            continue
        body = "".join(str(x) for x in lines)
        for c in chars:
            if c in body:
                matrix[c][dynasty] += 1
                if len(examples[c][dynasty]) < 3:
                    for ln in lines:
                        ln = str(ln).strip()
                        if c in ln and 4 <= len(ln) <= 30:
                            examples[c][dynasty].append(
                                {"line": ln, "title": title, "author": author}
                            )
                            break
    print(f"扫描完成 {n} 首 · {time.time()-t0:.0f}s")

    # 校验：各字全库合计 vs imagery.count
    cur.execute("SELECT `char`, count FROM imagery")
    ref = dict(cur.fetchall())
    bad = []
    for c in chars:
        total = sum(matrix[c].values())
        if ref.get(c) and abs(total - ref[c]) / max(ref[c], 1) > 0.05:
            bad.append((c, total, ref[c]))
    print("合计与 imagery.count 偏差>5% 的字:", bad if bad else "无（口径一致）")

    out = {
        "dynasties": [
            {"name": d, "poems": poem_totals.get(d, 0)} for d in DYNASTY_ORDER
        ],
        "chars": chars,
        "matrix": matrix,
        "examples": examples,
        "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    with open("data/imagery-dynasty.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print("已写入 data/imagery-dynasty.json")


if __name__ == "__main__":
    main()
