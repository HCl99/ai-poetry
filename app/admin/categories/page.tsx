'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHead, Empty, inputCls, primaryBtn } from '@/components/admin/ui';
import { formatSyncTime, useAutoRefresh } from '@/hooks/useAutoRefresh';

interface CatData {
  dynasties: { dynasty: string; count: number }[];
  imagery: { total: number; items: { char: string; count: number }[] };
}

export default function AdminCategoriesPage() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<CatData | null>(null);
  const [newChar, setNewChar] = useState('');
  const [busy, setBusy] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const { msg, show } = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (query = '') => {
    try {
      const res = await fetch(`/api/admin/categories${query ? `?q=${encodeURIComponent(query)}` : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      show('分类数据加载失败');
    }
  }, [show]);

  useEffect(() => { load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 其他管理员/用户端造成的计数变化会自动同步
  const { lastSync, refresh } = useAutoRefresh(() => { void load(q); }, 15000);

  async function addImagery() {
    const char = newChar.trim();
    if (!char) { show('请输入意象字'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ char }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '新增失败');
      show('意象已新增，可点「重算」刷新关联数');
      setNewChar('');
      load(q);
    } catch (e: unknown) {
      show((e as Error).message || '新增失败');
    } finally {
      setBusy(false);
    }
  }

  async function recalcImagery() {
    setRecalcBusy(true);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recalc' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '重算失败');
      show(`已按诗-意象关联重算 ${d.updated} 个意象`);
      load(q);
    } catch (e: unknown) {
      show((e as Error).message || '重算失败');
    } finally {
      setRecalcBusy(false);
    }
  }

  async function removeImagery(char: string) {
    const ok = await confirm({
      title: '删除意象',
      message: `确定删除意象「${char}」吗？其与诗词的关联也会一并清理。`,
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/categories?char=${encodeURIComponent(char)}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '删除失败');
      show('已删除');
      load(q);
    } catch (e: unknown) {
      show((e as Error).message || '删除失败');
    }
  }

  if (!data) {
    return <div className="flex items-center justify-center py-24 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>;
  }

  const maxDyn = Math.max(...data.dynasties.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <PageHead title="分类管理" desc="朝代分布与意象清单维护；社区发帖分类已独立到「社区分类」" />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-c bg-white/50 px-3 py-2 font-ui text-[11px] text-ink-soft">
        <span>统计每 15 秒自动同步 · 上次 {formatSyncTime(lastSync)}</span>
        <button onClick={() => refresh()} className="inline-flex items-center gap-1 rounded-full border border-c px-2.5 py-1 transition-ink">
          <RotateCcw className="h-3 w-3" /> 刷新统计
        </button>
      </div>

      {/* 朝代分布 */}
      <section className="paper-card p-5">
        <h2 className="mb-3 font-ui text-[15px] font-medium text-ink-deep">朝代分布（共 {data.dynasties.reduce((s, d) => s + d.count, 0)} 首）</h2>
        <div className="space-y-2">
          {data.dynasties.slice(0, 8).map((d) => (
            <div key={d.dynasty} className="flex items-center gap-3">
              <span className="w-10 shrink-0 font-ui text-sm text-ink-deep">{d.dynasty}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--inset)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(d.count / maxDyn) * 100}%`, background: 'var(--btn-grad)' }} />
              </div>
              <span className="w-16 shrink-0 text-right font-ui text-xs text-ink-soft">{d.count} 首</span>
            </div>
          ))}
        </div>
      </section>

      {/* 意象管理 */}
      <section className="paper-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-ui text-[15px] font-medium text-ink-deep">意象清单（{data.imagery.total}）</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <input
                className={`${inputCls} w-40 pl-9`}
                placeholder="搜索意象字"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') load(q); }}
              />
            </div>
            <input className={`${inputCls} w-24`} placeholder="新意象字" value={newChar} onChange={(e) => setNewChar(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addImagery(); }} />
            <button disabled={busy} onClick={addImagery} className={primaryBtn} style={{ background: 'var(--btn-grad)' }}>
              <Plus className="h-4 w-4" /> 新增
            </button>
            <button disabled={recalcBusy} onClick={recalcImagery} className="inline-flex items-center gap-1.5 rounded-lg border border-c px-3 py-2 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-50">
              {recalcBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} 重算关联数
            </button>
          </div>
        </div>
        <p className="mb-3 font-ui text-[11px] text-ink-soft">数字为该意象关联的诗词数；新增诗词或删除意象后点「重算关联数」即可刷新。</p>
        {data.imagery.items.length === 0 ? (
          <Empty text="没有匹配的意象" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.imagery.items.map((i) => (
              <span key={i.char} className="group flex items-center gap-1.5 rounded-full border border-c px-3 py-1.5 font-ui text-sm text-ink-deep transition-ink hover:bg-paper-dark">
                {i.char}
                <span className="text-xs text-ink-soft">{i.count}</span>
                <button onClick={() => removeImagery(i.char)} className="ml-0.5 text-ink-soft opacity-60 transition-ink hover:text-[#A67C7C] hover:opacity-100" aria-label={`删除意象 ${i.char}`}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {confirm.dialog}
      <Toast msg={msg} />
    </div>
  );
}
