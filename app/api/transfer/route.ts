import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { embedText } from '@/lib/embedding';
import { topKSimilar } from '@/lib/vectorStore';
import { rerankTopN } from '@/lib/reranker';
import { SSE_HEADERS, sseEvent } from '@/lib/sse';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

const STYLES: Record<string, { name: string; desc: string; author: string }> = {
  libai: { name: '李白体', desc: '浪漫飘逸、想象瑰奇、豪放不羁，善用夸张与明月酒仙意象', author: '李白' },
  sushi: { name: '苏轼体', desc: '旷达豪放、超然物外、于困境中见豁达，理趣与深情并存', author: '苏轼' },
  wanyue: { name: '婉约体', desc: '婉转含蓄、细腻缠绵，善写离愁别绪与细雨梧桐（类李清照）', author: '李清照' },
  wangwei: { name: '王维体', desc: '空灵静谧、诗中有画，山水田园与禅意交融', author: '王维' },
  dufu: { name: '杜甫体', desc: '沉郁顿挫、忧国忧民、格律谨严，善写乱世羁旅与家国之思', author: '杜甫' },
};

export async function POST(req: Request) {
  const session = await auth();
  const { text, style } = (await req.json()) as { text?: string; style?: string };

  // 开流前的参数校验仍返回普通 JSON 错误，便于前端直接读取
  if (!text?.trim()) return Response.json({ error: '请输入现代文内容' }, { status: 400 });
  if (!style || !STYLES[style]) return Response.json({ error: '请选择风格' }, { status: 400 });

  const s = STYLES[style];
  const model = 'glm-4-flash';
  const t0 = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));
      try {
        /* ---- RAG：向量粗排 → CrossEncoder 精排，检索该风格诗人的语义相近范例 ---- */
        const queryVec = await embedText(text.trim());
        // score: 粗排余弦（展示）；rerankScore: 精排相关度（排序依据）
        let exemplars: { title: string; body: string; score: number; rerankScore?: number }[] = [];
        let rerankApplied = false;
        if (queryVec) {
          const coarse = await topKSimilar(queryVec, 12, undefined, (m) => m.author === s.author);
          if (coarse.length) {
            const rows = await prisma.poem.findMany({
              where: { id: { in: coarse.map((h) => h.id) } },
              select: { id: true, paragraphsSimp: true },
            });
            const bodyMap = new Map(rows.map((r) => [r.id, ((r.paragraphsSimp as string[] | null) || []).join('')]));
            const cands = coarse.map((h) => ({
              title: h.title,
              body: (bodyMap.get(h.id) || '').slice(0, 80),
              score: h.score,
            }));
            const reranked = await rerankTopN(
              text.trim(),
              cands,
              (item) => `《${item.title}》：${item.body}`,
              3,
            );
            if (reranked) {
              exemplars = reranked.map((r) => ({ ...r.item, rerankScore: r.score }));
              rerankApplied = true;
            } else {
              exemplars = cands.slice(0, 3);
            }
          }
        }
        send('step', {
          label: rerankApplied ? 'RAG · 风格范例检索（向量+精排）' : 'RAG · 风格范例检索',
          detail: exemplars.length
            ? exemplars.map((e) => `《${e.title}》 ${rerankApplied ? `精排 ${e.rerankScore}` : `相似度 ${e.score}`}`).join('；')
            : '未命中范例，使用模型内知识',
        });

        const exemplarCtx = exemplars.length
          ? `\n\n【${s.author}原作范例（向量语义检索）】\n${exemplars.map((e) => `《${e.title}》：${e.body}`).join('\n')}`
          : '';
        const prompt = `请将下面的现代文改写为一首古诗词，严格模仿${s.name}的风格特征（${s.desc}）。

【现代文】${text.trim()}
${exemplarCtx}
【要求】
1. 体裁为七言绝句或五言绝句（婉约体可为长短句）
2. 提取现代文中的核心意象与情感
3. 符合${s.name}的典型意象偏好与语言气质${exemplars.length ? '，可参考上述范例的遣词与气韵（化用而非抄袭）' : ''}
4. 平仄大致协调，偶数句押韵
5. 只输出诗词正文（每句一行），不要标题、不要解释`;

        send('meta', { style: s.name, form: '七言绝句', model, exemplars: exemplars.map((e) => ({ title: e.title, score: e.score })) });

        const resp = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: '你是精通古典诗词创作的AI诗人。只输出诗词正文，不输出任何解释。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.85,
          max_tokens: 300,
          stream: true,
        });

        let full = '';
        for await (const chunk of resp) {
          const delta = chunk.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            send('delta', { text: delta });
          }
        }

        const poem = full
          .replace(/^```[^\n]*\n?/, '')
          .replace(/```$/, '')
          .trim();
        if (!poem) throw new Error('empty output');

        // 流结束后再一次性落库（创作记录 + 学习历史）
        let saved = false;
        if (session?.user?.id) {
          await prisma.creation.create({
            data: {
              userId: session.user.id,
              style: s.name,
              inputText: text.trim().slice(0, 500),
              outputText: poem.slice(0, 1000),
              model,
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
          saved = true;
        }

        send('done', { poem, latencyMs: Date.now() - t0, saved });
      } catch (e: any) {
        console.error('transfer stream error', e?.message || e);
        send('error', { error: 'AI生成失败，请重试' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
