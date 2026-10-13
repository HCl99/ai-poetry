'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { PageHead, AdminTable, Tr, Td, Badge, Pagination, Empty, Modal, inputCls, textareaCls, primaryBtn } from '@/components/admin/ui';

interface PoemRow {
  id: string; title: string; author: string; dynasty: string;
  paragraphs: unknown; tags: unknown; hasAnnotation: boolean; createdAt: string;
}
interface FormState {
  id?: string; title: string; author: string; dynasty: string; paragraphs: string; tags: string;
}

const EMPTY_FORM: FormState = { title: '', author: '', dynasty: '唐', paragraphs: '', tags: '' };

export default function AdminPoemsPage() {
  const [q, setQ] = useState('');
  const [dynasty, setDynasty] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: PoemRow[]; total: number } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const { msg, show } = useToast();
  const size = 10;

  const load = useCallback(async (p = page) => {
    const params = new URLSearchParams({ page: String(p), size: String(size) });
    if (q) params.set('q', q);
    if (dynasty) params.set('dynasty', dynasty);
    try {
      const res = await fetch(`/api/admin/poems?${params}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      show('诗词列表加载失败');
    }
  }, [page, q, dynasty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(1); setPage(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openEdit(p: PoemRow) {
    const lines = Array.isArray(p.paragraphs) ? (p.paragraphs as string[]).join('\n') : String(p.paragraphs || '');
    const tags = Array.isArray(p.tags) ? (p.tags as string[]).join('、') : String(p.tags || '');
    setForm({ id: p.id, title: p.title, author: p.author, dynasty: p.dynasty, paragraphs: lines, tags });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/poems', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '保存失败');
      show(form.id ? '诗词已更新' : '诗词已新增');
      setForm(null);
      load();
    } catch (e: unknown) {
      show((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: PoemRow) {
    if (!confirm(`确定删除《${p.title}》吗？其注解、意象关联与向量切片将一并删除。`)) return;
    try {
      const res = await fetch(`/api/admin/poems?id=${p.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '删除失败');
      show('已删除');
      load();
    } catch (e: unknown) {
      show((e as Error).message || '删除失败');
    }
  }

  return (
    <div className="space-y-5">
      <PageHead title="诗词管理" desc="诗库增删改查 · 新增诗词可立即被探索与检索" />

      <div className="paper-card flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="搜索诗题或作者，回车确认"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(1); } }}
          />
        </div>
        <input
          className={`${inputCls} w-28`}
          placeholder="朝代筛选"
          value={dynasty}
          onChange={(e) => setDynasty(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(1); } }}
        />
        <button className={primaryBtn} style={{ background: 'var(--btn-grad)' }} onClick={() => setForm({ ...EMPTY_FORM })}>
          <Plus className="h-4 w-4" /> 新增诗词
        </button>
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-20 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>
      ) : data.items.length === 0 ? (
        <Empty text="没有匹配的诗词" />
      ) : (
        <div className="paper-card p-4">
          <AdminTable head={['诗题', '作者', '朝代', 'AI注解', '收录时间', '操作']}>
            {data.items.map((p) => (
              <Tr key={p.id}>
                <Td className="max-w-[220px] truncate font-medium">{p.title}</Td>
                <Td>{p.author}</Td>
                <Td>{p.dynasty}</Td>
                <Td><Badge status={p.hasAnnotation ? 'approved' : 'pending'} text={p.hasAnnotation ? '已生成' : '未生成'} /></Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{new Date(p.createdAt).toLocaleDateString()}</Td>
                <Td>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(p)} className="flex items-center gap-1 rounded-lg border border-c px-2.5 py-1 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark">
                      <Pencil className="h-3 w-3" /> 编辑
                    </button>
                    <button onClick={() => remove(p)} className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink" style={{ background: '#A67C7C' }}>
                      <Trash2 className="h-3 w-3" /> 删除
                    </button>
                  </div>
                </Td>
              </Tr>
            ))}
          </AdminTable>
          <Pagination page={page} size={size} total={data.total} onPage={(p) => { setPage(p); load(p); }} />
        </div>
      )}

      <Modal open={!!form} title={form?.id ? '编辑诗词' : '新增诗词'} onClose={() => setForm(null)}>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-ui text-xs text-ink-soft">诗题 *</label>
                <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block font-ui text-xs text-ink-soft">作者 *</label>
                <input className={inputCls} value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-ui text-xs text-ink-soft">朝代</label>
                <input className={inputCls} value={form.dynasty} onChange={(e) => setForm({ ...form, dynasty: e.target.value })} placeholder="唐 / 宋 / 元 / 明 / 清" />
              </div>
              <div>
                <label className="mb-1 block font-ui text-xs text-ink-soft">标签（顿号/逗号分隔）</label>
                <input className={inputCls} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="思乡、送别" />
              </div>
            </div>
            <div>
              <label className="mb-1 block font-ui text-xs text-ink-soft">诗文内容 *（每行一句）</label>
              <textarea className={`${textareaCls} min-h-[140px]`} value={form.paragraphs} onChange={(e) => setForm({ ...form, paragraphs: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setForm(null)} className="rounded-lg border border-c px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark">取消</button>
              <button onClick={save} disabled={saving} className={primaryBtn} style={{ background: 'var(--btn-grad)' }}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} 保存
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Toast msg={msg} />
    </div>
  );
}
