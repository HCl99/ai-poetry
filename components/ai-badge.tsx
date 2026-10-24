/**
 * AI 生成内容标识：用于注解、风格迁移、意象图等模型产出处。
 * 对应评审「AI 安全与可控性 · 可解释 / 可追溯」——让用户一眼分辨哪些内容是模型生成、依据是什么。
 */
export function AiBadge({ label = 'AI 生成', className = '' }: { label?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-c px-2 py-0.5 font-ui text-[10px] leading-none text-ink-soft ${className}`}
      title="本内容由大语言模型生成，仅供参考；引用诗篇与标注均来自知识库检索结果"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      </svg>
      {label}
    </span>
  );
}
