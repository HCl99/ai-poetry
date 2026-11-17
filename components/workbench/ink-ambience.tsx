/**
 * 工作台水墨氛围背景（v2.3 动态化）：比登录页更含蓄的墨晕呼吸 + 墨滴扩散 + 明月轻浮。
 * 纯 CSS 动画（fixed 定位，滚动时恒定），-z 层级不遮挡内容。
 */
export function InkAmbience() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* 明月：右上缓慢浮动（低透明，含蓄） */}
      <div
        className="anim-ink-float absolute right-[8%] top-[7%] h-24 w-24 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(196,169,101,0.3) 0%, rgba(196,169,101,0.12) 55%, rgba(196,169,101,0) 100%)' }}
      />
      {/* 墨晕色块 ×3：错峰呼吸 */}
      <div className="anim-ink-breathe absolute -left-24 top-[18%] h-72 w-72 rounded-full blur-[90px]" style={{ background: 'rgba(123,142,161,0.10)' }} />
      <div className="anim-ink-breathe absolute -right-20 top-[52%] h-64 w-64 rounded-full blur-[85px]" style={{ background: 'rgba(196,169,101,0.08)', animationDelay: '-4s' }} />
      <div className="anim-ink-breathe absolute left-[34%] top-[80%] h-56 w-56 rounded-full blur-[85px]" style={{ background: 'rgba(107,142,123,0.08)', animationDelay: '-8s' }} />
      {/* 墨滴晕染：周期性扩散消散 */}
      <div
        className="anim-ink-spread absolute left-[12%] top-[30%] h-48 w-48 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(139,115,85,0.16) 0%, rgba(139,115,85,0.04) 55%, transparent 75%)' }}
      />
      <div
        className="anim-ink-spread absolute bottom-[10%] right-[14%] h-52 w-52 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(123,142,161,0.14) 0%, rgba(123,142,161,0.04) 55%, transparent 75%)', animationDelay: '-3.5s' }}
      />
    </div>
  );
}
