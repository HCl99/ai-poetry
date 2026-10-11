/**
 * SSE（Server-Sent Events）工具：服务端编码 + 客户端解码，两端共用，无运行时副作用。
 * TextEncoder / TextDecoder 在 Node 18+ 与现代浏览器中均为全局对象。
 */

/** 流式响应统一响应头 */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

/** 服务端：把一条事件编码为 SSE 二进制帧 */
export function sseEvent(event: string, data: unknown): Uint8Array {
  const payload = JSON.stringify(data ?? {});
  return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`);
}

export interface SSEMessage<T = any> {
  event: string;
  data: T;
}

/**
 * 客户端：把 fetch 拿到的 Response.body 解析为 SSE 事件异步迭代器。
 * 自动处理跨 chunk 的半包与 \n\n / \r\n\r\n 分隔。
 */
export async function* sseEvents(res: Response): AsyncGenerator<SSEMessage> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        let event = 'message';
        const dataLines: string[] = [];
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length > 0) {
          try {
            yield { event, data: JSON.parse(dataLines.join('\n')) };
          } catch {
            // 半截 / 非 JSON 帧，忽略
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
