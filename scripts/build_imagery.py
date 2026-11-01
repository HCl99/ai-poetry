# -*- coding: utf-8 -*-
"""
build_imagery.py - 意象清单构建
扫描全唐诗，统计50个核心意象在诗篇中的出现，输出意象图谱数据。
输出: data/imagery.json
- imagery_list: 意象列表
- imagery_poems: 每个意象对应的代表诗篇（最多20首）
- co_occurrence: 意象共现矩阵（同一首诗中两个意象同时出现）
- stats: 统计信息
"""
import os
import json
import glob
from collections import defaultdict, Counter
from opencc import OpenCC

# 50个核心古典意象（按自然/植物/动物/器物/季节分类）
CORE_IMAGERY = [
    # 天象地理
    "月", "风", "云", "雪", "雨", "山", "水", "江", "河", "海",
    # 天象补遗（烟霞霜露，山水画常见）
    "烟", "霞", "星", "霜", "露",
    # 植物
    "花", "柳", "梅", "菊", "兰", "竹", "桃", "莲", "松", "草",
    # 动物
    "鸟", "雁", "莺", "燕", "蝶", "马", "鱼", "龙",
    # 建筑关塞
    "楼", "城", "关", "塞",
    # 水域行旅（舟桥为水墨画高频主体）
    "舟", "帆", "洲", "岸", "桥", "溪", "泉",
    # 器物寄情
    "酒", "灯", "笛", "钟",
    # 季节时令
    "春", "秋",
]
# 为加速匹配，每个意象匹配只看单字出现（古典诗多用单字意象）

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TANG_DIR = r"c:\Users\Lenovo\Desktop\传智杯\chinese-poetry-master\全唐诗"
OUT_PATH = os.path.join(PROJECT_ROOT, "data", "imagery.json")


def scan_tang_poems():
    """扫描全唐诗所有 poet.tang.*.json，返回 (title, author, paragraphs_list, id) 生成器"""
    files = sorted(glob.glob(os.path.join(TANG_DIR, "poet.tang.*.json")))
    print(f"[INFO] 全唐诗文件数: {len(files)}")
    for fp in files:
        try:
            with open(fp, "r", encoding="utf-8") as f:
                poems = json.load(f)
        except Exception as e:
            print(f"[WARN] 读取失败 {fp}: {e}")
            continue
        for p in poems:
            yield p


def main():
    cc = OpenCC("t2s")  # 繁体转简体
    imagery_cands = defaultdict(list)   # imagery -> 候选诗篇（扫描期先全收，末尾择优）
    imagery_count = Counter()            # imagery -> 出现总次数
    co_occurrence = Counter()            # (i,j) 共现次数
    total_poems = 0

    for p in scan_tang_poems():
        total_poems += 1
        # 合并段落为一段文本（先转简）
        paragraphs = p.get("paragraphs", [])
        text_simp = cc.convert("\n".join(paragraphs))
        # 找出本诗出现的所有意象
        found = set()
        for im in CORE_IMAGERY:
            if im in text_simp:
                found.add(im)
                imagery_count[im] += 1
        # 收集代表句：含该意象的那一句；记录本诗意象数（rich），末尾按 rich 择优。
        # 仅收 120 字内的短篇（绝句/律诗/短古），避免长排律因收字多而垄断"代表作"。
        lines = text_simp.split("\n")
        body_len = sum(len(l) for l in lines)
        if 8 <= body_len <= 120:
            for im in found:
                line = next((l.strip() for l in lines if im in l), "")
                imagery_cands[im].append({
                    "title": cc.convert(p.get("title", "")),
                    "author": cc.convert(p.get("author", "")),
                    "id": p.get("id", ""),
                    "line": line,
                    "rich": len(found),
                })
        # 共现：本诗出现的所有意象两两组合
        found_list = sorted(found)
        for i in range(len(found_list)):
            for j in range(i + 1, len(found_list)):
                a, b = found_list[i], found_list[j]
                key = f"{a}-{b}"
                co_occurrence[key] += 1

        if total_poems % 5000 == 0:
            print(f"[PROGRESS] 已扫描 {total_poems} 首")

    # 每个意象取「意象最丰富」的 20 首作为代表，同 richness 按 id 保证可复现
    imagery_poems = {}
    for im, cands in imagery_cands.items():
        cands.sort(key=lambda c: (-c["rich"], c["id"]))
        imagery_poems[im] = [
            {k: c[k] for k in ("title", "author", "id", "line")} for c in cands[:20]
        ]

    # 共现边全量输出（图谱页只取权重前 200 展示；以图搜诗需要覆盖全部组合）
    top_edges = sorted(co_occurrence.items(), key=lambda x: -x[1])
    edges_out = [{"source": k.split("-")[0], "target": k.split("-")[1], "weight": v}
                 for k, v in top_edges]

    result = {
        "imagery_list": CORE_IMAGERY,
        "imagery_count": dict(imagery_count.most_common()),
        "imagery_poems": {k: v for k, v in imagery_poems.items()},
        "co_occurrence": edges_out,
        "stats": {
            "total_poems_scanned": total_poems,
            "imagery_count_total": len(CORE_IMAGERY),
            "edges_count": len(edges_out),
        },
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[DONE] 输出: {OUT_PATH}")
    print(f"[STATS] 扫描诗篇: {total_poems}")
    print(f"[STATS] 意象覆盖: {len(imagery_count)}/{len(CORE_IMAGERY)}")
    print(f"[STATS] 共现边: {len(co_occurrence)}（全量）")
    print(f"[STATS] Top10意象: {imagery_count.most_common(10)}")


if __name__ == "__main__":
    main()
