/**
 * 登录/注册页水墨动态背景：明月浮动、墨晕呼吸、墨滴晕染、远山雾移、飞鸟轻浮。
 * 纯 CSS 动画装饰层（v2.2 动态化设计），低饱和慢速，不干扰表单阅读。
 */
export function InkBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 明月：缓慢浮动 */}
      <div
        className="anim-ink-float absolute right-[12%] top-[9%] h-28 w-28 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(196,169,101,0.5) 0%, rgba(196,169,101,0.2) 55%, rgba(196,169,101,0) 100%)' }}
      />
      {/* 墨晕色块 ×3：错峰呼吸 */}
      <div className="anim-ink-breathe absolute left-[6%] top-[22%] h-64 w-64 rounded-full blur-[80px]" style={{ background: 'rgba(123,142,161,0.16)' }} />
      <div className="anim-ink-breathe absolute right-[16%] bottom-[18%] h-56 w-56 rounded-full blur-[70px]" style={{ background: 'rgba(196,169,101,0.13)', animationDelay: '-4s' }} />
      <div className="anim-ink-breathe absolute left-[38%] top-[56%] h-52 w-52 rounded-full blur-[70px]" style={{ background: 'rgba(107,142,123,0.12)', animationDelay: '-8s' }} />
      {/* 墨滴晕染：周期性扩散消散 */}
      <div
        className="anim-ink-spread absolute left-[15%] top-[60%] h-44 w-44 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(139,115,85,0.3) 0%, rgba(139,115,85,0.08) 55%, transparent 75%)' }}
      />
      {/* 远山（两层静态剪影） */}
      <svg className="absolute bottom-0 left-0 w-[110%] text-ink-mid" viewBox="0 0 1440 260" fill="none" preserveAspectRatio="none" style={{ opacity: 0.16 }}>
        <path d="M0 260V150Q200 60 420 130T880 100T1440 140V260Z" fill="currentColor" />
      </svg>
      <svg className="absolute bottom-0 left-0 w-full text-ink-deep" viewBox="0 0 1440 200" fill="none" preserveAspectRatio="none" style={{ opacity: 0.1 }}>
        <path d="M0 200V110Q260 30 520 95T1040 80T1440 110V200Z" fill="currentColor" />
      </svg>
      {/* 山间雾气：横移 */}
      <div
        className="anim-ink-drift absolute bottom-[14%] left-0 h-16 w-[130%]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(250,248,243,0.55), transparent)' }}
      />
      {/* 飞鸟：轻浮 */}
      <svg className="anim-ink-float absolute left-[20%] top-[17%] h-8 w-16 text-ink-mid" viewBox="0 0 64 32" fill="none" style={{ opacity: 0.35, animationDelay: '-3s' }}>
        <path d="M8 20q8-10 16 0M28 14q8-10 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
