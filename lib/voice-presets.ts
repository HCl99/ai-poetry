/**
 * 朗读风格预设：把「诗人气质」映射到神经音色的语速 / 音高 / 音量。
 * - voice/rate/pitch/volume 供本地 edge-tts 服务（scripts/tts_server.py）使用
 * - browserRate/browserPitch 用于 TTS 服务不可用时的浏览器音色降级
 */
export type EmotionKey = 'auto' | 'narrator' | 'heroic' | 'broad' | 'gentle' | 'serene' | 'melancholy';

export interface VoicePreset {
  label: string;
  desc: string;
  voice: string;
  rate: string;
  pitch: string;
  volume: string;
  browserPitch: number;
}

export const VOICE_PRESETS: Record<Exclude<EmotionKey, 'auto'>, VoicePreset> = {
  narrator: {
    label: '吟诵（默认）',
    desc: '舒缓自然的叙述音色，适合注解与释义',
    voice: 'zh-CN-XiaoxiaoNeural',
    rate: '-4%',
    pitch: '-2Hz',
    volume: '+0%',
    browserPitch: 1,
  },
  heroic: {
    label: '豪放 · 李白',
    desc: '明亮有力，语速稍快、音高上扬',
    voice: 'zh-CN-YunjianNeural',
    rate: '+6%',
    pitch: '+6Hz',
    volume: '+8%',
    browserPitch: 1.1,
  },
  broad: {
    label: '旷达 · 苏轼',
    desc: '从容开阔，中速平稳',
    voice: 'zh-CN-YunxiNeural',
    rate: '+2%',
    pitch: '+2Hz',
    volume: '+3%',
    browserPitch: 1.05,
  },
  gentle: {
    label: '婉约 · 李清照',
    desc: '轻柔细腻，语速放慢、音色偏高',
    voice: 'zh-CN-XiaoyiNeural',
    rate: '-8%',
    pitch: '+4Hz',
    volume: '-4%',
    browserPitch: 1.12,
  },
  serene: {
    label: '山水 · 王维',
    desc: '清淡悠远，慢速低吟',
    voice: 'zh-CN-XiaoxiaoNeural',
    rate: '-10%',
    pitch: '-4Hz',
    volume: '-6%',
    browserPitch: 0.95,
  },
  melancholy: {
    label: '沉郁 · 杜甫',
    desc: '低回顿挫，语速最慢、音色低沉',
    voice: 'zh-CN-YunyangNeural',
    rate: '-12%',
    pitch: '-6Hz',
    volume: '-2%',
    browserPitch: 0.9,
  },
};

export const EMOTION_OPTIONS: { key: EmotionKey; label: string }[] = [
  { key: 'auto', label: '自动（按诗人风格）' },
  ...(Object.keys(VOICE_PRESETS) as Exclude<EmotionKey, 'auto'>[]).map((key) => ({
    key,
    label: VOICE_PRESETS[key].label,
  })),
];

const AUTHOR_HINTS: [string, Exclude<EmotionKey, 'auto'>][] = [
  ['李白', 'heroic'],
  ['苏轼', 'broad'],
  ['李清照', 'gentle'],
  ['柳永', 'gentle'],
  ['王维', 'serene'],
  ['杜甫', 'melancholy'],
];

/** 从待朗读文本中识别诗人，回退到默认吟诵风格 */
export function inferEmotion(text: string): Exclude<EmotionKey, 'auto'> {
  for (const [name, key] of AUTHOR_HINTS) {
    if (text.includes(name)) return key;
  }
  return 'narrator';
}

export function resolvePreset(emotion: EmotionKey, text: string): VoicePreset {
  return VOICE_PRESETS[emotion === 'auto' ? inferEmotion(text) : emotion];
}

const PUNCT_END = /[，。！？；：、,.!?;:]$/;

/** 保证每句以标点收尾，TTS 才会在该句末做出「收束感」而不是念成半口气 */
export function withClausePunct(text: string, index: number): string {
  const t = text.trim();
  if (!t) return t;
  if (PUNCT_END.test(t)) return t;
  return t + (index % 2 === 1 ? '。' : '，');
}

/**
 * 朗诵断句：句与句之间的停顿（毫秒）
 * 音频首尾静音已在服务端裁掉，这里的停顿就是纯呼吸间隔：
 * 逗号短停、分号中停、句号长停，题名与朝代作者之后再留一个明显停顿。
 */
export function pauseAfter(text: string, index: number, total: number): number {
  if (index === 0 && total > 1) return 760;
  const last = text.trim().slice(-1);
  if ('，、,'.includes(last)) return 200;
  if ('；;：:'.includes(last)) return 360;
  if ('。！？!?.'.includes(last)) return 620;
  return 340;
}

/** 服务端只接受白名单音色，避免把任意字符串透传给 TTS 服务 */
export const ALLOWED_VOICES = new Set(Object.values(VOICE_PRESETS).map((p) => p.voice));
