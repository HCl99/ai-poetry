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
        <link rel="preconnect" href="https://fonts.googleapis.cn" />
        <link
          href="https://fonts.googleapis.cn/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-serif antialiased">{children}</body>
    </html>
  );
}
