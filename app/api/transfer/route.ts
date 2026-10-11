import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

const STYLES: Record<string, { name: string; desc: string }> = {
  libai: { name: '李白体', desc: '浪漫飘逸、想象瑰奇、豪放不羁，善用夸张与明月酒仙意象' },
  sushi: { name: '苏轼体', desc: '旷达豪放、超然物外、于困境中见豁达，理趣与深情并存' },
  wanyue: { name: '婉约体', desc: '婉转含蓄、细腻缠绵，善写离愁别绪与细雨梧桐（类李清照）' },
  wangwei: { name: '王维体', desc: '空灵静谧、诗中有画，山水田园与禅意交融' },
  dufu: { name: '杜甫体', desc: '沉郁顿挫、忧国忧民、格律谨严，善写乱世羁旅与家国之思' },
};

export async function POST(req: Request) {
  const session = await auth();
  const { text, style } = (await req.json()) as { text?: string; style?: string };
  if (!text?.trim()) return Response.json({ error: '请输入现代文内容' }, { status: 400 });
  if (!style || !STYLES[style]) return Response.json({ error: '请选择风格' }, { status: 400 });

  const s = STYLES[style];
  const prompt = `请将下面的现代文改写为一首古诗词，严格模仿${s.name}的风格特征（${s.desc}）。

【现代文】${text.trim()}

【要求】
1. 体裁为七言绝句或五言绝句（婉约体可为长短句）
2. 提取现代文中的核心意象与情感
3. 符合${s.name}的典型意象偏好与语言气质
4. 平仄大致协调，偶数句押韵
5. 只输出诗词正文（每句一行），不要标题、不要解释`;

  const t0 = Date.now();
  try {
    const resp = await client.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是精通古典诗词创作的AI诗人。只输出诗词正文，不输出任何解释。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.85,
      max_tokens: 300,
    });
    const poem = (resp.choices[0]?.message?.content?.trim() || '')
      .replace(/^```.*\n?/, '')
      .replace(/```$/, '')
      .trim();
    const latencyMs = Date.now() - t0;
    if (!poem) return Response.json({ error: '生成失败，请重试' }, { status: 502 });

    /* 保存创作记录 + 学习记录 */
    if (session?.user?.id) {
      await prisma.creation.create({
        data: {
          userId: session.user.id,
          style: s.name,
          inputText: text.trim().slice(0, 500),
          outputText: poem.slice(0, 1000),
          model: 'glm-4-flash',
        },
      });
      await prisma.history.create({
        data: {
          userId: session.user.id,
          actionType: 'transfer',
          title: `${s.name}创作`,
          detail: text.trim().slice(0, 80),
        },
      });
    }

    return Response.json({ poem, style: s.name, form: '七言绝句', latencyMs, model: 'glm-4-flash' });
  } catch (e: any) {
    console.error('transfer error', e?.message || e);
    return Response.json({ error: 'AI生成失败，请重试' }, { status: 502 });
  }
}
