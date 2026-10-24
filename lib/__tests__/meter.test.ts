import { describe, it, expect } from 'vitest';
import { checkMeter, pingzeOf, rhymeOf, summarizeMeter, meterFormFor } from '../meter';

/**
 * 格律后校验器单测。
 * 注意：按中华新韵以今读（现代汉语拼音）判定，古入声字不回溯——
 * 故所选经典样本均为今读下同样合规之作（如《静夜思》有两处二四不交替，
 * 在「软规则过半才判负」的宽容口径下仍应通过）。
 */
describe('pingzeOf / rhymeOf 单字查询', () => {
  it('常见字平仄与韵部正确', () => {
    expect(pingzeOf('东')).toBe('平');
    expect(rhymeOf('东')).toBe('十一庚');
    expect(pingzeOf('风')).toBe('平');
    expect(pingzeOf('月')).toBe('仄');
    expect(rhymeOf('月')).toBe('三皆');
    expect(pingzeOf('白')).toBe('平'); // 古入声今读平声，按今读判定
    expect(pingzeOf('不')).toBe('仄');
    expect(rhymeOf('楼')).toBe('七尤');
    expect(rhymeOf('霜')).toBe('十唐');
  });

  it('十三支（舌尖元音）与十二齐（舌面 i）区分', () => {
    expect(rhymeOf('知')).toBe('十三支');
    expect(rhymeOf('资')).toBe('十三支');
    expect(rhymeOf('衣')).toBe('十二齐');
    expect(rhymeOf('西')).toBe('十二齐');
  });

  it('j/q/x/y 后的 u 还原为 ü（十二齐而非十四姑）', () => {
    expect(rhymeOf('去')).toBe('十二齐');
    expect(rhymeOf('雨')).toBe('十二齐');
    expect(rhymeOf('路')).toBe('十四姑');
  });

  it('未收录字返回 null', () => {
    expect(pingzeOf('😀')).toBeNull();
    expect(rhymeOf('😀')).toBeNull();
  });
});

describe('checkMeter · 律绝（经典合格样本）', () => {
  it('王之涣《登鹳雀楼》（五绝，流/楼押七尤）', () => {
    const r = checkMeter(
      ['白日依山尽，', '黄河入海流。', '欲穷千里目，', '更上一层楼。'],
      'jueju5',
    );
    expect(r.rhymeOk).toBe(true);
    expect(r.lines[1].rhymeGroup).toBe('七尤');
    expect(r.lines[3].rhymeGroup).toBe('七尤');
    expect(r.pingzeOk).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('李白《静夜思》（五绝古绝，霜/乡押十唐；二四两处不交替宽容通过）', () => {
    const r = checkMeter(
      ['床前明月光，', '疑是地上霜。', '举头望明月，', '低头思故乡。'],
      'jueju5',
    );
    expect(r.rhymeOk).toBe(true);
    expect(r.pingzeOk).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('杜甫《绝句》（七绝，天/船押八寒）', () => {
    const r = checkMeter(
      ['两个黄鹂鸣翠柳，', '一行白鹭上青天。', '窗含西岭千秋雪，', '门泊东吴万里船。'],
      'jueju7',
    );
    expect(r.rhymeOk).toBe(true);
    expect(r.lines[1].rhymeGroup).toBe('八寒');
    expect(r.pingzeOk).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('李白《黄鹤楼送孟浩然之广陵》（七绝，州/流押七尤）', () => {
    const r = checkMeter(
      ['故人西辞黄鹤楼，', '烟花三月下扬州。', '孤帆远影碧空尽，', '唯见长江天际流。'],
      'jueju7',
    );
    expect(r.rhymeOk).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('杜甫《蜀相》（七律，森/音/心/襟押九文）', () => {
    const r = checkMeter(
      [
        '丞相祠堂何处寻，', '锦官城外柏森森。',
        '映阶碧草自春色，', '隔叶黄鹂空好音。',
        '三顾频烦天下计，', '两朝开济老臣心。',
        '出师未捷身先死，', '长使英雄泪满襟。',
      ],
      'lvshi7',
    );
    expect(r.rhymeOk).toBe(true);
    for (const i of [1, 3, 5, 7]) expect(r.lines[i].rhymeGroup).toBe('九文');
    expect(r.pingzeOk).toBe(true);
    expect(r.pass).toBe(true);
  });
});

describe('checkMeter · 律绝（违规检出）', () => {
  it('押韵错误：偶数句韵脚不同部应检出', () => {
    const r = checkMeter(
      ['青山映晚霞，', '流水绕松林。', '孤舟横野渡，', '明月照城楼。'],
      'jueju5',
    );
    expect(r.rhymeOk).toBe(false); // 林（九文）与楼（七尤）不同部
    expect(r.pass).toBe(false);
    expect(r.lines[3].issues.join('')).toContain('押韵不合');
  });

  it('平仄错误：偶数句以仄声收尾应检出（韵部相同但非平韵）', () => {
    const r = checkMeter(
      ['北风卷地起，', '寒山飘暮雪。', '孤云天际涌，', '冷光照残月。'],
      'jueju5',
    );
    expect(r.rhymeOk).toBe(true); // 雪/月同属三皆，韵部本身一致
    expect(r.pingzeOk).toBe(false); // 偶数句末字须平声
    expect(r.pass).toBe(false);
    expect(r.lines[1].issues.join('')).toContain('平声收尾');
    expect(r.lines[3].issues.join('')).toContain('平声收尾');
  });

  it('奇数句（首句除外）以平声收尾应检出', () => {
    const r = checkMeter(
      ['白日依山尽，', '黄河入海流。', '欲穷千里来，', '更上一层楼。'],
      'jueju5',
    );
    expect(r.pingzeOk).toBe(false); // 第 3 句末字「来」为平声
    expect(r.pass).toBe(false);
    expect(r.lines[2].issues.join('')).toContain('仄声收尾');
  });

  it('summarizeMeter 输出含句号的违规摘要', () => {
    const r = checkMeter(
      ['青山映晚霞，', '流水绕松林。', '孤舟横野渡，', '明月照城楼。'],
      'jueju5',
    );
    const s = summarizeMeter(r);
    expect(s).toContain('第4句');
    expect(s.length).toBeGreaterThan(0);
  });
});

describe('checkMeter · 未知字健壮性', () => {
  it('emoji / 生僻字不导致崩溃，不参与判定，记录于 unknownChars', () => {
    const r = checkMeter(
      ['白😀依山尽，', '黄河入海流。', '欲穷千里目，', '更上一层楼。'],
      'jueju5',
    );
    expect(r.unknownChars).toContain('😀');
    expect(r.lines[0].pingze[1]).toBe('?');
    expect(r.pass).toBe(true); // 首句本已宽容，未知字跳过交替检查
  });

  it('符号/假名等未收录字符（含增补平面代理对遍历）安全处理', () => {
    const r = checkMeter(
      ['白日依山尽，', '黄河入海◎。', '欲穷千里目，', '更上一层楼。'],
      'jueju5',
    );
    // 偶数句末字未收录 → 已知韵脚不足两个，宽容通过
    expect(r.unknownChars).toContain('◎');
    expect(r.rhymeOk).toBe(true);
    expect(r.lines[1].rhymeGroup).toBeNull();
  });
});

describe('checkMeter · 词（cipai，只校验押韵）', () => {
  const hxxPass = [
    '细雨微风送晚香，', '小池春水映斜阳。', '归来燕子语雕梁。',
    '独坐闲庭思旧事，', '轻摇团扇纳新凉。', '一帘幽梦月侵床。',
  ];
  it('浣溪沙韵脚合格（第 2、3、6 句末字同部）', () => {
    const r = checkMeter(hxxPass, 'cipai', '浣溪沙');
    expect(r.rhymeOk).toBe(true);
    expect(r.pingzeOk).toBe(true); // 词恒为 true
    expect(r.pass).toBe(true);
  });

  it('浣溪沙韵脚不合格应检出', () => {
    const bad = [...hxxPass];
    bad[5] = '一帘幽梦泪湿衣。'; // 衣（十二齐）≠ 阳/梁（十唐）
    const r = checkMeter(bad, 'cipai', '浣溪沙');
    expect(r.rhymeOk).toBe(false);
    expect(r.pass).toBe(false);
  });

  it('浣溪沙按句数可推断词牌（cipai 缺省）', () => {
    const r = checkMeter(hxxPass, 'cipai');
    expect(r.pass).toBe(true);
  });

  it('苏轼《定风波》（主押韵句声/行/生/迎/晴皆属十一庚）', () => {
    const r = checkMeter(
      [
        '莫听穿林打叶声，', '何妨吟啸且徐行。', '竹杖芒鞋轻胜马，', '谁怕？', '一蓑烟雨任平生。',
        '料峭春风吹酒醒，', '微冷，', '山头斜照却相迎。', '回首向来萧瑟处，', '归去，', '也无风雨也无晴。',
      ],
      'cipai',
      '定风波',
    );
    expect(r.rhymeOk).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('定风波主韵一致率不足 60% 应检出', () => {
    const r = checkMeter(
      [
        '清风拂面水无声，', '岸边桃李正开花。', '小舟一叶随波动，', '谁问，', '远山含翠映残雪。',
        '独倚阑干思故人，', '归去，', '长亭之外柳拂柳。', '回首故园烟水处，', '休问，', '天际孤鸿伴冷月。',
      ],
      'cipai',
      '定风波',
    );
    // 主韵位：声(庚)/花(麻)/雪(皆)/柳(尤)/月(皆) → 最高一致率 2/5 = 40%
    expect(r.rhymeOk).toBe(false);
    expect(r.pass).toBe(false);
  });
});

describe('meterFormFor 体裁映射', () => {
  it('按体裁参数映射校验形式', () => {
    expect(meterFormFor([7, 7, 7, 7], '诗')).toBe('jueju7');
    expect(meterFormFor([5, 5, 5, 5], '诗')).toBe('jueju5');
    expect(meterFormFor([7, 7, 7, 7, 7, 7, 7, 7], '诗')).toBe('lvshi7');
    expect(meterFormFor([7, 7, 7, 7, 7, 7], '词')).toBe('cipai');
  });
});
