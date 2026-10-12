'use client';

import html2canvas from 'html2canvas';

export interface ShareSection {
  tag: string;
  content: string;
}

export interface ShareCardProps {
  kind: 'annotate' | 'transfer';
  title: string;
  subtitle: string;
  poemLines: string[];
  sections?: ShareSection[];
  note?: string;
  image?: string;
  footer: string;
}

const BRUSH = "'Ma Shan Zheng','Noto Serif SC',serif";
const SANS = "'Noto Sans SC',system-ui,sans-serif";

/**
 * 水墨风分享卡（离屏渲染后经 html2canvas 合成 PNG）
 * 注意：html2canvas 对 flex gap 支持不完整，间距一律用 margin
 */
export function ShareCard({ kind, title, subtitle, poemLines, sections, note, image, footer }: ShareCardProps) {
  return (
    <div
      style={{
        width: 560,
        background: '#FAF8F3',
        border: '1px solid #E5DFD4',
        borderRadius: 16,
        padding: '34px 38px',
        fontFamily: "'Noto Serif SC',STSong,serif",
        color: '#3A3835',
      }}
    >
      {/* 品牌头 */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span
          style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg,#3A3835,#5D5853)', color: '#FAF8F3',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: BRUSH, fontSize: 17,
          }}
        >
          墨
        </span>
        <span style={{ marginLeft: 10, fontFamily: BRUSH, fontSize: 22, color: '#3A3835' }}>墨韵诗心</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8B857E', fontFamily: SANS }}>
          {kind === 'annotate' ? 'AI 智能注解' : 'AI 风格迁移'}
        </span>
      </div>

      {/* 标题区 */}
      <div style={{ textAlign: 'center', marginTop: 22 }}>
        <div style={{ fontFamily: BRUSH, fontSize: 30, color: '#3A3835' }}>{title}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#8B857E', fontFamily: SANS }}>{subtitle}</div>
      </div>
      <div style={{ height: 1, margin: '16px auto', width: '72%', background: 'rgba(60,50,40,0.18)' }} />

      {/* 诗句正文 */}
      <div style={{ textAlign: 'center', fontSize: 17, lineHeight: 2.3, color: '#3A3835' }}>
        {poemLines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>

      {/* 现代文原文（风格迁移） */}
      {note && (
        <div style={{ marginTop: 18, background: '#F5F2EC', borderRadius: 10, padding: '10px 14px', fontSize: 12, lineHeight: 1.8, color: '#5D5853', fontFamily: SANS }}>
          <span style={{ color: '#8B7355', fontWeight: 600 }}>现代文原文 · </span>
          {note}
        </div>
      )}

      {/* 四维度注解 */}
      {sections?.map((s) => (
        <div key={s.tag} style={{ marginTop: 12, borderLeft: '3px solid #8B7355', background: '#F5F2EC', borderRadius: 8, padding: '9px 13px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#3A3835', fontFamily: SANS }}>{s.tag}</div>
          <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.85, color: '#5D5853', fontFamily: SANS }}>{s.content}</div>
        </div>
      ))}

      {/* 水墨意境图 */}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          crossOrigin="anonymous"
          alt="水墨意境图"
          style={{ marginTop: 16, width: '100%', borderRadius: 10, border: '1px solid #D4CFC5' }}
        />
      )}

      {/* 页脚 */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', fontSize: 10, color: '#8B857E', fontFamily: SANS }}>
        <span>{footer}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              width: 18, height: 18, borderRadius: 4, background: '#A67C7C', color: '#FAF8F3',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontFamily: BRUSH, marginRight: 6,
            }}
          >
            印
          </span>
          言之有据 · 墨韵诗心
        </span>
      </div>
    </div>
  );
}

/** 将离屏分享卡合成为 PNG 并触发下载 */
export async function downloadSharePng(el: HTMLElement, filename: string) {
  const canvas = await html2canvas(el, { backgroundColor: '#FAF8F3', scale: 2, useCORS: true });
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}
