/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允许通过 NEXT_DIST_DIR 指定独立的构建输出目录（README 9.4 的复现命令依赖此项）
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
    // 启用 instrumentation：服务器启动时预热向量库
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
