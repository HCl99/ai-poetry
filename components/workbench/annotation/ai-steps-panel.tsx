interface Step { label: string; detail?: string; tool?: string; ms?: number; hits?: number }
interface RelatedPoem { id: string; title: string; author: string; dynasty: string; score?: number | null }

interface Props {
  steps: Step[];
  model: string;
  related: RelatedPoem[];
  latencyMs?: number;
  phase: 'retrieve' | 'generate' | 'done';
  loading: boolean;
}

/** AI 链路面板：从向量化 → 检索 → 精排 → 小传 → 生成，逐步展示所用技术 */
export function AiStepsPanel({ steps, model, related, latencyMs, phase, loading }: Props) {
  return (
    <div className="rounded-lg p-4" style={{ background: 'rgba(123,142,161,0.06)', border: '1px dashed #C9CFD6' }}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-ui text-[11px]">
        <span className="text-xs font-medium text-muted-blue">思考轨迹（Agent 工具链）</span>
        <span className="text-ink-soft">模型 {model || 'GLM'}</span>
        {related.length > 0 && <span className="text-ink-soft">检索命中 {related.length} 篇</span>}
        {latencyMs ? <span className="text-ink-soft">总耗时 {(latencyMs / 1000).toFixed(1)}s</span> : null}
      </div>
      <ol className="space-y-2.5">
        {steps.map((st, i) => {
          const tag = st.tool
            ? st.tool.replace(/_/g, ' ')
            : /向量|语义/.test(st.label) ? 'Embedding'
            : /精排|rerank/i.test(st.label) ? 'Rerank'
            : /RAG|检索/.test(st.label) ? 'RAG'
            : /小传/.test(st.label) ? '知识库'
            : /格律/.test(st.label) ? '本地算法'
            : /生成|撰写/.test(st.label) ? 'LLM'
            : '流程';
          return (
            <li key={i} className="flex items-start gap-2.5 font-ui text-xs">
              <span
                className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]"
                style={{ background: 'rgba(139,115,85,0.14)', color: '#8B7355' }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="rounded-[3px] px-1.5 py-[1px] text-[10px]"
                    style={{ background: 'rgba(107,142,123,0.12)', color: '#4F6B58' }}
                  >
                    {tag}
                  </span>
                  <span className="text-ink-mid">{st.label}</span>
                  {typeof st.hits === 'number' && (
                    <span className="rounded-[3px] px-1.5 py-[1px] text-[10px]" style={{ background: 'rgba(123,142,161,0.12)', color: '#5A6B7B' }}>
                      命中 {st.hits}
                    </span>
                  )}
                  {typeof st.ms === 'number' && (
                    <span className="text-[10px] tabular-nums text-ink-soft/70">{st.ms} ms</span>
                  )}
                  {st.tool === 'check_meter' && (
                    <span
                      className="rounded-[3px] px-1.5 py-[1px] text-[10px]"
                      style={{ background: 'rgba(139,115,85,0.12)', color: '#8B7355' }}
                      title="韵书与平仄判定在本地完成，不发起网络请求"
                    >
                      本地计算 · 零请求
                    </span>
                  )}
                </div>
                {st.detail && <p className="mt-0.5 leading-relaxed text-ink-soft/80">{st.detail}</p>}
              </div>
            </li>
          );
        })}
        {loading && (
          <li className="flex items-center gap-2.5 font-ui text-xs text-ink-soft">
            <span className="mt-[1px] h-4 w-4 shrink-0" />
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#7B8EA1' }} />
              {phase === 'retrieve' ? '正在检索知识库…' : '大模型正在撰写四维度注解…'}
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}
