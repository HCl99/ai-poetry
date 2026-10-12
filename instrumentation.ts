// Next.js instrumentation：服务器启动时预热向量库，避免评审演示时首个注解请求等待冷加载
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 后台触发加载，不阻塞启动
    import('@/lib/vectorStore')
      .then(({ warmup }) => warmup())
      .catch(() => {
        /* 向量服务未就绪时静默，运行期会自动降级 */
      });
  }
}
