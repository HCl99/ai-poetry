# -*- coding: utf-8 -*-
"""
生成 lib/data/xinyun.json：常用汉字 → 中华新韵韵部 + 声调（格律后校验器数据源）。

体系：中华新韵（十四韵部，按现代汉语拼音韵母划分）——
  1 一麻(a/ia/ua)  2 二波(o/e/uo)  3 三皆(ê/ie/üe)  4 四开(ai/uai)
  5 五微(ei/ui)    6 六豪(ao/iao)  7 七尤(ou/iu)    8 八寒(an/ian/uan/üan)
  9 九文(en/in/un/ün) 10 十唐(ang/iang/uang) 11 十一庚(eng/ing/ong/iong)
  12 十二齐(i/er/ü) 13 十三支(舌尖前/后 -i：zi/ci/si/zhi/chi/shi/ri) 14 十四姑(u)

数据来源与近似限制（构建期工具 pypinyin，运行时零依赖）：
  - 字表取自 pypinyin 内置拼音字典（4 万余字，覆盖全部常用字与绝大多数生僻字）；
  - 多音字仅取 pypinyin 默认首读音（如「重/长/乐/行」只录一音），格律校验按所录读音判定，
    属有意为之的近似——AI 生成辅助校验宁宽勿严，次要读音误差不影响主流程；
  - 古入声字（如「白/一/不」）按今读标调，不做平水韵入声回溯（见 lib/meter.ts 注释）。

pypinyin 输出归一化细节：
  - `ü` 在 n/l 后写作 v（女 nv→v），在 j/q/x/y 后按拼音拼写规则省略两点写作 u（去 qu→u），
    故「u 韵母 + j/q/x/y 声母」需还原为 ü 归入十二齐，其余 u 归十四姑；
  - 十三支与十二齐同为 i 韵母，靠声母区分：zh/ch/sh/r/z/c/s 后为舌尖元音（十三支）；
  - strict=False 时 uei→ui、iou→iu、uen→un、üe→ue、üan→uan、ün→un，
    除 ü 系列已在同韵部内无需再分外，直接按下表归类即可。

输出为紧凑分组格式：data 的键为 "声调-韵部序号"（声调 1-4，轻声 5），值为该组所有字的字符串，
以控制 JSON 体积（4 万字全量约 150KB，远低于 300KB 预算）。
"""
import json
import os
import sys

from pypinyin import pinyin, Style
from pypinyin.pinyin_dict import pinyin_dict

# 舌尖前/后音声母：其 i 为舌尖元音（十三支），而非舌面 i（十二齐）
APICAL_INITIALS = {'zh', 'ch', 'sh', 'r', 'z', 'c', 's'}
# j/q/x/y 后的 u 实为 ü（拼写规则省略两点），归十二齐而非十四姑
UMLAUT_INITIALS = {'j', 'q', 'x', 'y'}

RHYME_NAMES = ['一麻', '二波', '三皆', '四开', '五微', '六豪', '七尤',
               '八寒', '九文', '十唐', '十一庚', '十二齐', '十三支', '十四姑']

# 韵母 → 韵部序号（1-14）；ü 系列已按上方归一化说明折算
FINAL_TO_RHYME = {}
for _idx, _finals in [
    (1, 'a ia ua'), (2, 'o e uo'), (3, 'ie ue ve ê'),
    (4, 'ai uai'), (5, 'ei ui uei'), (6, 'ao iao'),
    (7, 'ou iu iou'), (8, 'an ian uan van'),
    (9, 'en in un vn uen'), (10, 'ang iang uang'),
    (11, 'eng ing ong iong'), (12, 'i er v'), (14, 'u'),
]:
    for _f in _finals.split():
        FINAL_TO_RHYME[_f] = _idx


def classify(final: str, initial: str):
    """韵母 → 中华新韵韵部序号（1-14），无法归类返回 None。"""
    f = (final or '').replace('ü', 'v').replace('u:', 'v').lower()
    if not f:
        return None
    # pypinyin 非严格模式下 ye 的韵母写作 e（实为 ie），是唯一会跨韵部的 y/w 简写，特判归三皆
    if initial == 'y' and f == 'e':
        f = 'ie'
    if f == 'i':
        # 十三支（舌尖元音）与十二齐（舌面 i）的区分
        return 13 if initial in APICAL_INITIALS else 12
    if f == 'u' and initial in UMLAUT_INITIALS:
        return 12  # qu/ju/xu/yu 实为 ü
    return FINAL_TO_RHYME.get(f)


def main():
    groups = {}  # "tone-rhyme" -> [chars]
    skipped = 0
    for code in pinyin_dict.keys():
        ch = chr(int(code))
        try:
            t3 = pinyin(ch, style=Style.TONE3, heteronym=False,
                        neutral_tone_with_five=True)[0][0]
            final = pinyin(ch, style=Style.FINALS, heteronym=False, strict=False)[0][0]
            initial = pinyin(ch, style=Style.INITIALS, heteronym=False, strict=False)[0][0]
        except Exception:
            skipped += 1
            continue
        # 声调：TONE3 末位数字（轻声经 neutral_tone_with_five 标 5）
        tone = 5
        for c in reversed(t3):
            if c.isdigit():
                tone = int(c)
                break
        rhyme = classify(final, initial)
        if rhyme is None:
            skipped += 1
            continue
        groups.setdefault(f'{tone}-{rhyme}', []).append(ch)

    data = {k: ''.join(v) for k, v in sorted(groups.items())}
    out = {'version': 1, 'scheme': '中华新韵十四韵部（按现代汉语拼音韵母划分）',
           'rhymes': RHYME_NAMES, 'data': data}
    total = sum(len(v) for v in data.values())
    dst = os.path.join(os.path.dirname(__file__), '..', 'lib', 'data', 'xinyun.json')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(',', ':'))
    size_kb = os.path.getsize(dst) / 1024
    print(f'已生成 {os.path.abspath(dst)}')
    print(f'收录 {total} 字（跳过 {skipped}），分组 {len(data)} 组，文件 {size_kb:.1f} KB')

    # 抽查：关键测试字的韵部/声调
    probe = '东风夜月白一不楼流乡光霜衣去雨台回'
    for ch in probe:
        hit = [k for k, v in data.items() if ch in v]
        if hit:
            t, r = hit[0].split('-')
            print(f'  {ch} → {RHYME_NAMES[int(r)-1]}({r}) {"平" if t in "12" else "仄" if t in "34" else "轻声"}{t}声')
        else:
            print(f'  {ch} → 未收录！')


if __name__ == '__main__':
    sys.exit(main())
