import { auth } from '@/auth';
import { SSE_HEADERS, sseEvent } from '@/lib/sse';
import { checkAiRateLimit } from '@/lib/rateLimit';
import { AGENT_TOOLS, executeAgentTool } from '@/lib/agentTools';
import { checkCitations } from '@/lib/citationCheck';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new OpenAI({
  apiKey: process.env.ZHIPUAI_API_KEY,
  baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});

const MAX_TOOL_ROUNDS = 4;

/**
 * 图谱问答（Function Calling Agent）：
 * 模型自主规划并调用图谱查询工具（诗人互提/意象共现/诗篇检索/全图概览），
 * 工具结果回填对话循环作答；最终回答执行引用硬约束校验，
 * 只允许引用工具召回的诗题，杜绝编造。
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const limited = checkAiRateLimit(session.user.id, 'graph-qa', 10);
  if (limited) return limited;

  const { kind, question } = (await req.json()) as { kind?: 'poet' | 'imagery'; question?: string };
  if (!question?.trim()) return Response.json({ error: '缺少 question' }, { status: 400 });
  if (kind !== 'poet' && kind !== 'imagery') return Response.json({ error: 'kind 必须是 poet 或 imagery' }, { status: 400 });

  const q = question.trim().slice(0, 100);
  const t0 = Date.now();
  const model = 'glm-4-flash';

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));
      try {
        send('step', { label: 'Agent 规划', detail: '解析问题，自主选择图谱查询工具' });

        const messages: Record<string, unknown>[] = [
          {
            role: 'system',
            content: `你是古典诗词知识图谱问答助手（Agent），必须通过调用工具获取库内真实数据后作答。
工具选择：诗人交往/影响类问题用 search_poet_relations；意象象征/情感类问题用 search_imagery；查证诗句出处或举例用 search_poems；总体概况用 get_graph_overview。
硬性规则：
1. 回答前必须至少调用一次工具，禁止凭记忆直接回答；
2. 工具调用不超过 ${MAX_TOOL_ROUNDS} 轮；
3. 仅依据工具返回的数据回答，数字、次数、关系必须与工具结果一致；
4. 引用诗篇时用《诗题》标注，且只能引用工具结果中出现过的诗题；
5. 数据不足时明确说明「图谱暂无该数据」，严禁编造。
当前场景：${kind === 'poet' ? '诗人关系图谱' : '意象共现图谱'}。回答 120 字以内。`,
          },
          { role: 'user', content: q },
        ];

        const retrievedTitles = new Set<string>();
        const toolTrail: string[] = [];
        let rounds = 0;
        let directAnswer = '';

        // Agent 循环：工具轮非流式以拿完整 tool_calls
        while (rounds < MAX_TOOL_ROUNDS) {
          rounds++;
          const resp = await client.chat.completions.create({
            model,
            messages: messages as never,
            tools: AGENT_TOOLS as never,
            temperature: 0.3,
            max_tokens: 600,
          });
          const msg = resp.choices?.[0]?.message;
          const calls = msg?.tool_calls || [];
          if (!calls.length) {
            directAnswer = msg?.content || '';
            break;
          }
          messages.push(msg as never);
          for (const tc of calls) {
            if (!('function' in tc) || !tc.function) continue;
            const fn = tc.function.name || '';
            const argsStr = tc.function.arguments || '{}';
            send('step', { label: `Agent 调用工具 ${fn}`, detail: argsStr.slice(0, 80) });
            const { text, poemTitles } = await executeAgentTool(fn, argsStr);
            poemTitles.forEach((t) => retrievedTitles.add(t));
            toolTrail.push(`${fn} → ${text.slice(0, 80)}`);
            send('step', { label: '工具返回', detail: text.slice(0, 110) });
            messages.push({ role: 'tool', tool_call_id: tc.id, content: text } as never);
          }
        }

        let full = directAnswer;
        if (full) {
          // 模型未调工具直接作答（罕见）：一次性透出
          send('delta', { text: full });
        } else {
          // 最终流式回答：工具已应答，收束输出（不带 tools）
          send('step', { label: '生成回答', detail: `依据 ${retrievedTitles.size} 篇工具召回数据` });
          const finalResp = await client.chat.completions.create({
            model,
            messages: messages as never,
            temperature: 0.3,
            max_tokens: 400,
            stream: true,
          });
          for await (const chunk of finalResp) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              full += delta;
              send('delta', { text: delta });
            }
          }
        }

        // 引用硬约束：只允许引用工具召回的诗题
        const cite = checkCitations(full, '', [...retrievedTitles]);
        send('done', {
          latencyMs: Date.now() - t0,
          model,
          context: toolTrail,
          citations: { total: cite.total, valid: cite.valid, invalid: cite.invalid },
          agentRounds: rounds,
        });
      } catch (e: any) {
        console.error('graph-qa error', e?.message || e);
        send('error', { error: '图谱问答失败，请重试' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
