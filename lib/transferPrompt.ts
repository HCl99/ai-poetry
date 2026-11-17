import type { StyleDef } from './transferStyles';
import { shapeOf } from './poemShape';

export type Exemplar = {
  title: string;
  sents: string[];
  score: number;
  rerankScore?: number;
};

/** 取正文各句（剔除词牌名行），用于核对句数与逐句字数 */
export function poemBodySentences(poem: string, cipai?: string): string[] {
  return poem
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !(cipai && l.replace(/[《》〈〉〔〕·\s]/g, '').startsWith(cipai)));
}

/** 剔除 markdown 代码围栏（模型偶尔输出 ``` 包裹） */
export function stripCodeFence(t: string): string {
  return t.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim();
}

/**
 * 构建风格迁移的主创作 prompt（诗/词两个分支，含格式硬约束与内容侧硬约束）。
 * 纯函数、无外部依赖，便于单测与复用。
 */
export function buildTransferPrompt(text: string, s: StyleDef, exemplars: Exemplar[]): string {
  const exemplarCtx = exemplars.length
    ? `\n\n【${s.author}原作范例（向量语义检索）】\n${exemplars.map((e) => `《${e.title}》：${e.sents.join('')}`).join('\n')}`
    : '';
  // 句式蓝本：取「句式与目标体裁完全一致」的原作（库中确有苏轼《定风波》、李清照《浣溪沙》同句式的原作）。
  // flash 对纯文字描述的字数极不敏感，必须给一份同句式的原作对照才可能「对上号」。
  // 实测对照：原样罗列原作（本式）命中率显著高于「逐句编号｜字数｜原文」（编号会被 flash 误读，反而 0 命中）。
  const bp = exemplars.find((e) => e.sents.length && shapeOf(e.sents) === s.shape.join(','));
  const blueprint = bp
    ? `【句式蓝本】${s.author}《${bp.title}》原作，逐句字数依次 ${shapeOf(bp.sents)}（务必逐句对应改写，每句字数与原句完全一致，只换字词、严禁照抄原句、严禁重复任何一行）：\n${bp.sents.join('\n')}`
    : `【句式蓝本】目标体裁${s.form}，共 ${s.shape.length} 句，逐句字数依次 ${s.shape.join('·')}，请严格按此句式逐句填写。`;
  // 体裁分支：诗（唐代诗人）与词（宋代词人）要求不同，避免宋词被写成唐诗的绝句/律诗
  const isCi = s.genre === '词';
  // 逐句字数格模板：让模型「以字填格」，比抽象描述更能锁住词牌句式
  const cellRows: string[] = [];
  s.shape.forEach((n, i) => {
    if (s.blankAfter && i === s.blankAfter) cellRows.push('    │');
    cellRows.push(`${String(i + 1).padStart(2, ' ')}  │ ${'○'.repeat(n)}`);
  });
  const scaffold = cellRows.join('\n');
  const tot = s.shape.reduce((a, b) => a + b, 0);
  const hardRules = `【格式硬约束·必须逐句核对】体裁为${s.form}，共 ${s.shape.length} 句、全篇共 ${tot} 字（标点不计），逐句单独成行（严禁两句挤在同一行），逐句字数：${s.shape.map((n, i) => `第${i + 1}句${n}字`).join('；')}。请严格「以字填格」，每行只填一格、不得增删行数：
${scaffold}
${s.blankAfter ? '（模板中的空行即上下阕分界）\n' : ''}`;
  // 词：不展示 ○ 字格模板（实测模型会把模板当正文一起输出），只给「原作句式蓝本 + 逐句字数」；
  // 且提示尽量精简——冗长要求会让模型直接忽略字数约束、写成七言齐言。
  const ciRules = `【格式要求】体裁为${s.form}，共 ${s.shape.length} 句、全篇共 ${tot} 字（标点不计），逐句单独成行（严禁两句挤在同一行），逐句字数依次为 ${s.shape.join('、')}；务必逐句对齐、不得增删行数。${
    s.blankAfter
      ? `上阕 ${s.blankAfter} 句（${s.shape.slice(0, s.blankAfter).join('·')}），下阕 ${s.shape.length - s.blankAfter} 句（${s.shape.slice(s.blankAfter).join('·')}），上、下阕之间空一行；两阕都要写满，缺一句即不合律。`
      : ''
  }
只输出正文（不含词牌名、不解释）。`;
  // 内容侧硬约束：模型容易脱离输入自由发挥（写「月亮」却写出西湖、长庚、白发）
  const groundRules = `【贴合原文·硬约束】
1. 只允许使用【现代文】里出现过的意象、地点、人物、季节与情绪；输入中没有的专名（如西湖、长庚）、身份（如青丝白发）、事件一律不得添加。
2. ${
    isCi
      ? '上阕写「此刻」——时间、所在、眼前所见、手边的一个动作；下阕写「由此想起的」——回忆或心绪，末句落到一个具体画面（如月照窗、人独坐）'
      : '前两句写「此刻」——时间、所在、眼前所见；后两句写由此生出的心绪，末句落到一个具体画面'
  }，不要空喊「知音」「天涯」「何处」。
3. 每句只写一个画面或一个动作；同一个词全篇最多出现 2 次（如「月」「故乡」不得反复堆叠）。
4. 把现代口语换成古典说法：加班→夜值／未眠，手机→音书，回家→归；不得直接出现「加班、上班、下班、手机、电脑、地铁、公交、公司、打工」等现代词。
5. 二字顿句必须是实词短语或短促动作（如「无寐」「独坐」「回望」「推窗」「谁怕」「微冷」），禁止「何事」「还是」「依旧」「且看」「何妨」这类没有实义的虚词凑字数。
6. 严禁套用任何古人的成句（如「明月何时照我还」「千里共婵娟」），也严禁整句照搬范例；每一句都必须是自己新写的。
7. 成稿必须能看出与【现代文】的对应关系，不能写成与输入无关的通用抒情。`;
  return isCi
    ? `请将下面的现代文改写为一首词，模仿${s.name}的风格（${s.desc}）。
【现代文】${text.trim()}
${blueprint}
${ciRules}
${groundRules}`
    : `请将下面的现代文改写为一首诗，严格模仿${s.name}的风格特征（${s.desc}）。

【现代文】${text.trim()}
${exemplarCtx}${blueprint}
【要求】
1. 体裁为${s.formHint}
2. 提取现代文中的核心意象与情感
3. 符合${s.name}的典型意象偏好与语言气质${exemplars.length ? '，可参考上述范例的遣词与气韵（化用而非抄袭）' : ''}
4. 平仄大致协调，偶数句押韵；句数与每句字数必须严格符合上述体裁（绝句四句、律诗八句），不得多写或少写
5. 只输出诗词正文（不要解释、不要标题）

${hardRules}
${groundRules}`;
}

/** 校验不过时的重写要求（第二轮起追加到主 prompt 之后） */
export function buildRewriteSuffix(s: StyleDef, retryReason: string): string {
  return `${retryReason}请重新独立创作：严格写 ${s.shape.length} 句、每句单独成行、逐句字数严格对应上表${s.genre === '词' ? '；韵脚按词牌押同一韵部' : '；偶数句末字押同一韵部且用平声、奇数句（首句除外）末字用仄声，注意第 2、4、6 字平仄交替'}；严禁重复任何一句、严禁照抄上一版。`;
}
