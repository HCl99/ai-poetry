import OpenAI from 'openai';

let _client: OpenAI | null = null;

/**
 * 智谱 OpenAI 兼容客户端单例（各 AI 路由共用，消除样板重复）。
 * 惰性初始化：首次调用时才读取环境变量，便于测试与按需加载。
 */
export function getAiClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.ZHIPUAI_API_KEY;
    if (!apiKey) {
      throw new Error('ZHIPUAI_API_KEY 未配置：请在 .env 中填入智谱 API Key（申请地址 https://open.bigmodel.cn/）');
    }
    _client = new OpenAI({
      apiKey,
      baseURL: process.env.ZHIPUAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
    });
  }
  return _client;
}

/** 供路由快速判断 AI 服务是否可用（用于降级/提示） */
export function isAiConfigured(): boolean {
  return !!process.env.ZHIPUAI_API_KEY;
}
