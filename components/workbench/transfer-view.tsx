'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';

const STYLES = [
  { key: 'libai', name: '李白体', hint: '浪漫飘逸 · 想象瑰奇' },
  { key: 'sushi', name: '苏轼体', hint: '旷达豪放 · 超然物外' },
  { key: 'wanyue', name: '婉约体', hint: '婉转含蓄 · 细腻缠绵' },
  { key: 'wangwei', name: '王维体', hint: '空灵静谧 · 诗中有画' },
  { key: 'dufu', name: '杜甫体', hint: '沉郁顿挫 · 忧国忧民' },
];

const EXAMPLE = '下雨天一个人走回家，路上想起了远方的朋友';

export function TransferView() {
  const [style, setStyle] = useState('sushi');
  const [text, setText] = useState(EXAMPLE);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ poem: string; style: string; form: string; latencyMs: number } | null>(null);
  const [error, setError] = useState('');
  const { msg, show } = useToast();

  async function generate() {
    if (loading) return;
    if (!text.trim()) { show('请输入现代文内容'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, style }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || '生成失败');
      setResult(data);
      show('风格迁移完成');
    } catch (e: any) {
      setError(e.message || '网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">风格迁移</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          Agent六步推理：语义分析 → 意象提取 → 风格匹配 → 样本检索 → 生成初稿 → 格律校验
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左栏：输入与风格 */}
        <div className="paper-card p-6">
          <h2 className="mb-4 font-ui text-[15px] font-medium text-ink-deep">选择风格</h2>
          <div className="flex flex-wrap gap-2.5">
            {STYLES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStyle(s.key)}
                className="rounded-full border-[1.5px] px-4 py-2 font-ui text-sm transition-ink"
                style={
                  style === s.key
                    ? { background: '#3A3835', color: '#FAF8F3', borderColor: '#3A3835' }
                    : { borderColor: '#D4CFC5', color: '#5D5853' }
                }
                title={s.hint}
              >
                {s.name}
              </button>
            ))}
          </div>
          <p className="mt-2.5 font-ui text-xs text-ink-soft">
            {STYLES.find((s) => s.key === style)?.hint}
          </p>

          <h2 className="mb-3 mt-6 font-ui text-[15px] font-medium text-ink-deep">输入现代文</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="写下你想转化为古诗词的现代文…"
            className="min-h-[120px] w-full resize-y rounded-lg border-[1.5px] border-c bg-white/60 p-4 font-ui text-sm leading-relaxed outline-none transition-ink focus:border-ink-deep"
          />
          <div className="mt-2 flex items-center justify-between">
            <button onClick={() => setText(EXAMPLE)} className="font-ui text-xs text-ink-soft transition-ink hover:text-ink-mid">
              填入示例
            </button>
            <span className="font-ui text-xs text-ink-soft/70">{text.length} 字</span>
          </div>

          {error && (
            <div className="mt-4 rounded-lg px-3 py-2 text-center font-ui text-sm" style={{ background: 'rgba(166,124,124,0.1)', color: '#A67C7C' }}>
              {error}
            </div>
          )}

          <button
            onClick={generate}
            disabled={loading}
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#7B8EA1,#5D5853)' }}
          >
            {loading ? <span className="spinner" style={{ width: 15, height: 15 }} /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Agent推理中…' : '开始风格迁移'}
          </button>
        </div>

        {/* 右栏：生成结果 */}
        <div className="paper-card flex min-h-[420px] flex-col p-6">
          <h2 className="mb-4 font-ui text-[15px] font-medium text-ink-deep">生成结果</h2>
          {loading && (
            <div className="flex flex-1 flex-col items-center justify-center py-16">
              <span className="spinner spinner-ink" style={{ width: 20, height: 20 }} />
              <p className="mt-4 font-ui text-sm text-ink-soft">AI正在生成…</p>
              <p className="mt-1 font-ui text-xs text-ink-soft/70">提取意象 → 匹配诗人风格 → 格律校验</p>
            </div>
          )}
          {!loading && !result && (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <Sparkles className="h-12 w-12 text-ink-soft/40" strokeWidth={1.5} />
              <p className="mt-4 font-ui text-sm text-ink-soft">选择风格，输入现代文，点击「开始风格迁移」</p>
              <p className="mt-1 font-ui text-xs text-ink-soft/70">AI将把白话转化为对应诗人的古风诗词</p>
            </div>
          )}
          {!loading && result && (
            <div className="flex flex-1 flex-col anim-fade-in">
              <div className="flex flex-1 items-center justify-center rounded-lg p-8" style={{ background: '#F5F2EC' }}>
                <p className="whitespace-pre-line text-center font-serif text-lg leading-[2.6] text-ink-deep">
                  {result.poem}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between font-ui text-xs text-ink-soft">
                <span>{result.style} · {result.form}</span>
                <span>glm-4-flash · {(result.latencyMs / 1000).toFixed(1)}s · 已存入我的创作</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
