import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { SSE_HEADERS, sseEvent } from '@/lib/sse';
import { checkAiRateLimit } from '@/lib/rateLimit';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

/** 诗人对话：persona RAG——小传 + 库内代表作构建人设，引用硬约束限定只能谈库内作品 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'poet-chat', 12);
  if (limited) return limited;

  const { poet, message, history } = (await req.json()) as {
    poet?: string;
    message?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
  };
  if (!poet?.trim() || !message?.trim()) return Response.json({ error: '缺少 poet 或 message' }, { status: 400 });

  const bio = await prisma.poetBio.findFirst({ where: { name: poet.trim() } });
  const works = await prisma.poem.findMany({
    where: { author: poet.trim() },
    select: { title: true, paragraphsSimp: true },
    take: 6,
  });
  if (!bio && works.length === 0) return Response.json({ error: `诗库中暂无「${poet}」的资料` }, { status: 404 });

  const bioCtx = bio?.bioSimp?.slice(0, 600) || bio?.bioDesc?.slice(0, 600) || '（暂无小传）';
  const worksCtx = works
    .map((w) => `《${w.title}》：${((w.paragraphsSimp as string[] | null) || []).join('').slice(0, 100)}`)
    .join('\n');
  const workTitles = works.map((w) => `《${w.title}》`).join('、');

  const t0 = Date.now();
  const model = 'glm-4-flash';
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));
      try {
        const sys = `你现在是${bio?.dynasty || '古'}诗人「${poet}」本人，在「墨韵诗心」平台与一位现代访客对谈。

【你的生平】${bioCtx}

【你确认拥有的作品（仅限这些可谈）】
${worksCtx}

【对话要求】
1. 以第一人称、半文半白的口吻说话，符合你的时代与性情，亲切自然，每次回答 150 字以内；
2. 谈及自己的作品时，只允许提及上述列表中的作品${workTitles ? `（${workTitles}）` : ''}，可以吟诵其中文句；严禁编造列表之外的作品或文句；
3. 涉及你不了解的后世事物，以你所在时代的视角好奇发问即可，不要装懂；
4. 结尾可以自然地向访客提一个小问题，推动对话。`;

        const histMsgs = (history || [])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-8)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: (m.content || '').slice(0, 400) }));

        const resp = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: sys },
            ...histMsgs,
            { role: 'user', content: message.trim().slice(0, 300) },
          ],
          temperature: 0.8,
          max_tokens: 600,
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
        send('done', { latencyMs: Date.now() - t0, model });
      } catch (e: any) {
        console.error('poet-chat error', e?.message || e);
        send('error', { error: '对话生成失败，请重试' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
