'use client';

import { useEffect } from 'react';

/** 全局错误边界：根布局自身崩溃时的最后兜底（不经过 root layout，需自带 html/body） */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // 兜底页不显示技术细节，但把原始异常打进控制台，便于定位触发原因
  useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: "'Noto Serif SC',STSong,serif", background: '#F5F2EC' }}>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ width: '100%', maxWidth: 420, borderRadius: 12, padding: 32, textAlign: 'center', background: '#FAF8F3', border: '1px solid #D4CFC5' }}>
            <p style={{ margin: 0, fontSize: 56, fontFamily: "'Ma Shan Zheng','Noto Serif SC',serif", color: '#3A3835' }}>误</p>
            <p style={{ margin: '16px 0 0', fontSize: 17, color: '#5D5853' }}>山重水复疑无路，柳暗花明又一村</p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#8B857E' }}>应用发生了严重错误{error?.digest ? `（错误码 ${error.digest}）` : ''}</p>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#A39D95' }}>
              开发模式下热更新可能导致页面状态失效，此时请重新加载页面
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
              <button
                onClick={reset}
                style={{
                  padding: '10px 22px', borderRadius: 8, border: 'none',
                  background: '#3A3835', color: '#FAF8F3', fontSize: 14, cursor: 'pointer',
                }}
              >
                重试
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 22px', borderRadius: 8, border: '1px solid #D4CFC5',
                  background: 'transparent', color: '#3A3835', fontSize: 14, cursor: 'pointer',
                }}
              >
                重新加载页面
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
