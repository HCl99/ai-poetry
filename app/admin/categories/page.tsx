'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { PageHead, Empty, inputCls, primaryBtn } from '@/components/admin/ui';

interface CatData {
  dynasties: { dynasty: string; count: number }[];
  imagery: { total: number; items: { char: string; count: number }[] };
  categories: { name: string; count: number }[];
}

const CAT_DESC: Record<string, string> = {
  '诗词赏析': '品读名篇、拆解技法的深度赏析帖',
  '学习心得': '背诵方法、学习路线与打卡记录',
  '原创诗词': '风格迁移作品与原创习作分享',
  '问答': '字词句疑惑、典故出处求助',
};

export default function AdminCategoriesPage() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<CatData | null>(null);
  const [newChar, setNewChar] = useState('');
  const [busy, setBusy] = useState(false);
  const { msg, show } = useToast();

  const load = useCallback(async (query = q) => {
    try {
      const res = await fetch(`/api/admin/categories${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      show('分类数据加载失败');
    }
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      show('意象已新增');
      setNewChar('');
      load();
    } catch (e: unknown) {
      show((e as Error).message || '新增失败');
    } finally {
      setBusy(false);
    }
  }

  async function removeImagery(char: string) {
    if (!confirm(`确定删除意象「${char}」吗？其与诗词的关联也会一并清理。`)) return;
    try {
      const res = await fetch(`/api/admin/categories?char=${encodeURIComponent(char)}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '删除失败');
      show('已删除');
      load();
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
      <PageHead title="分类管理" desc="朝代分布、意象清单与社区帖子分类的维护入口" />

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
          <div className="ml-auto flex items-center gap-2">
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
          </div>
        </div>
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

      {/* 社区分类 */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data.categories.map((c) => (
          <div key={c.name} className="paper-card p-5">
            <div className="flex items-center justify-between">
              <span className="font-brush text-xl text-ink-deep">{c.name}</span>
              <span className="font-ui text-sm" style={{ color: '#7B8EA1' }}>{c.count} 帖</span>
            </div>
            <p className="mt-1 font-ui text-xs text-ink-soft">{CAT_DESC[c.name]}</p>
          </div>
        ))}
      </section>
      <Toast msg={msg} />
    </div>
  );
}
