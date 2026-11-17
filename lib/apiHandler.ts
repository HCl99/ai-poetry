/**
 * API 路由统一错误包装：捕获处理链路中未接住的异常，
 * 打印服务端日志并向前端返回友好的中文 500 响应（此前依赖全局 error.tsx 兜底，错误信息不友好）。
 *
 * 用法：
 *   export const GET = withApi(async (req: Request) => { ... });
 *   // 需要第二参数（如 { params }）时：
 *   export const POST = withApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { ... });
 */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Handler<P extends unknown[] = []> = (...args: P) => Promise<Response>;

export function withApi<P extends unknown[]>(handler: Handler<P>): Handler<P> {
  return async (...args: P) => {
    try {
      return await handler(...args);
    } catch (e: any) {
      if (e instanceof ApiError) {
        return Response.json({ error: e.message }, { status: e.status });
      }
      console.error('[api] unhandled route error:', e?.message || e);
      return Response.json({ error: '服务器开小差了，请稍后重试' }, { status: 500 });
    }
  };
}
