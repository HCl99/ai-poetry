import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '墨韵诗心 · AI古诗词文化探索平台',
  description:
    '融合大语言模型与知识库检索增强，提供智能注解、诗人风格迁移与意象图谱，探索古典诗词的意境之美',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        {/* 首屏毛笔字子集（约 13KB）：决定 LCP，全量字体改为按 unicode-range 惰性加载 */}
        <link rel="preload" href="/fonts/brush-boot.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="font-serif antialiased">
        {children}
      </body>
    </html>
  );
}
