'use client';

/** 全局错误边界：根布局自身崩溃时的最后兜底（不经过 root layout，需自带 html/body） */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: "'Noto Serif SC',STSong,serif", background: '#F5F2EC' }}>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ width: '100%', maxWidth: 420, borderRadius: 12, padding: 32, textAlign: 'center', background: '#FAF8F3', border: '1px solid #D4CFC5' }}>
            <p style={{ margin: 0, fontSize: 56, fontFamily: "'Ma Shan Zheng','Noto Serif SC',serif", color: '#3A3835' }}>误</p>
            <p style={{ margin: '16px 0 0', fontSize: 17, color: '#5D5853' }}>山重水复疑无路，柳暗花明又一村</p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#8B857E' }}>应用发生了严重错误{error?.digest ? `（错误码 ${error.digest}）` : ''}</p>
            <button
              onClick={reset}
              style={{
                marginTop: 22, padding: '10px 22px', borderRadius: 8, border: 'none',
                background: '#3A3835', color: '#FAF8F3', fontSize: 14, cursor: 'pointer',
              }}
            >
              重试
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
