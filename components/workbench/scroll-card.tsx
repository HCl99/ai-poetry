'use client';

/**
 * 诗画长卷分享卡：水墨意境图 + 竖排右起诗句 + 题签 + 印章页脚
 * 离屏渲染后经 downloadSharePng（html2canvas）合成长图 PNG
 * 注意：html2canvas 不支持 flex gap 与 writing-mode，竖排以逐字 flex 列模拟，间距一律用 margin
 */

export interface ScrollCardProps {
  /** 题签（竖排第一列），如「婉约体新作」 */
  title: string;
  /** 副标题，如「诗画长卷 · AI 风格迁移」 */
  subtitle: string;
  poemLines: string[];
  /** 现代文原文/灵感 */
  note?: string;
  /** 水墨意境图 URL（可空） */
  image?: string;
  footer: string;
}

const BRUSH = "'Ma Shan Zheng','Noto Serif SC',serif";
const SANS = "'Noto Sans SC',system-ui,sans-serif";
const MAX_CHARS = 12; // 每列最多字数
const MAX_COLS = 12; // 最多列数

/** 诗句切列：长句按每列字数折列，右起排列 */
function splitColumns(lines: string[]): string[] {
  const cols: string[] = [];
  for (const l of lines.map((x) => x.trim()).filter(Boolean).slice(0, 8)) {
    for (let i = 0; i < l.length; i += MAX_CHARS) cols.push(l.slice(i, i + MAX_CHARS));
  }
  return cols.slice(0, MAX_COLS);
}

export function ScrollCard({ title, subtitle, poemLines, note, image, footer }: ScrollCardProps) {
  const cols = splitColumns(poemLines);
  const titleChars = [...title.replace(/[·\s]/g, '')].slice(0, 10);
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
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8B857E', fontFamily: SANS }}>{subtitle}</span>
      </div>

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

      {/* 长卷正文：竖排右起，题签列居最右 */}
      <div
        style={{
          marginTop: 18,
          background: '#F5F2EC',
          border: '1px solid #E5DFD4',
          borderRadius: 12,
          padding: '26px 20px',
          display: 'flex',
          flexDirection: 'row-reverse',
          justifyContent: 'center',
          alignItems: 'flex-start',
          minHeight: 380,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: 18 }}>
          {titleChars.map((ch, i) => (
            <span key={i} style={{ fontFamily: BRUSH, fontSize: 24, lineHeight: 1.5, color: '#8B7355' }}>{ch}</span>
          ))}
        </div>
        {cols.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: 14 }}>
            {[...col].map((ch, i) => (
              <span key={i} style={{ fontSize: 20, lineHeight: 1.75, color: '#3A3835' }}>{ch}</span>
            ))}
          </div>
        ))}
      </div>

      {/* 现代文原文 */}
      {note && (
        <div style={{ marginTop: 16, background: '#F5F2EC', borderRadius: 10, padding: '10px 14px', fontSize: 12, lineHeight: 1.8, color: '#5D5853', fontFamily: SANS }}>
          <span style={{ color: '#8B7355', fontWeight: 600 }}>现代文原文 · </span>
          {note}
        </div>
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
