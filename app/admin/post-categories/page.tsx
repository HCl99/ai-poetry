'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHead, Modal, inputCls, textareaCls, primaryBtn } from '@/components/admin/ui';
import { formatSyncTime, useAutoRefresh } from '@/hooks/useAutoRefresh';

interface CategoryItem { id: string; name: string; desc: string; postCount: number }

const MAX_CATEGORIES = 12;

export default function AdminPostCategoriesPage() {
  const [items, setItems] = useState<CategoryItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CategoryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const { msg, show } = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/post-categories', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { items?: CategoryItem[] };
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch {
      show('分类数据加载失败');
    }
  }, [show]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 帖子数由审核/发帖行为改变，定时同步；编辑弹窗打开时不覆盖正在输入的内容
  const { lastSync, refresh } = useAutoRefresh(() => { if (!editing) void load(); }, 15000);

  /** 把整份分类清单写回服务端；改名迁移、删除占用校验由接口统一处理 */
  async function saveCategories(list: { id: string; name: string; desc: string }[], successMsg: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/post-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: list }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '保存失败');
      show(successMsg);
      setEditing(null);
      await load();
      return true;
    } catch (e: unknown) {
      show((e as Error).message || '保存失败');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openEdit(c?: CategoryItem) {
    if (!items) return;
    setEditing(c || { id: `cat-${Date.now().toString(36)}`, name: '', desc: '', postCount: 0 });
    setEditName(c?.name || '');
    setEditDesc(c?.desc || '');
  }

  async function submitEdit() {
    if (!items || !editing) return;
    const name = editName.trim();
    if (!name) { show('请填写分类名称'); return; }
    const next = items.map((c) => ({ id: c.id, name: c.name, desc: c.desc }));
    const isNew = !next.some((c) => c.id === editing.id);
    if (!isNew) {
      const i = next.findIndex((c) => c.id === editing.id);
      next[i] = { id: editing.id, name, desc: editDesc.trim() || '暂无描述' };
    } else {
      if (next.length >= MAX_CATEGORIES) { show(`最多支持 ${MAX_CATEGORIES} 个分类`); return; }
      next.push({ id: editing.id, name, desc: editDesc.trim() || '暂无描述' });
    }
    await saveCategories(next, isNew ? '分类已新增，用户端发帖选项已同步' : '分类已更新，历史帖子已同步迁移');
  }

  async function removeCategory(c: CategoryItem) {
    if (!items) return;
    if (c.postCount > 0) { show(`「${c.name}」下还有 ${c.postCount} 条帖子，暂不可删除`); return; }
    if (items.length <= 1) { show('至少保留一个分类'); return; }
    const ok = await confirm({
      title: '删除分类',
      message: `确定删除「${c.name}」吗？该分类下没有帖子，删除后用户端发帖选项会同步移除。`,
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;
    const next = items.filter((x) => x.id !== c.id).map((x) => ({ id: x.id, name: x.name, desc: x.desc }));
    await saveCategories(next, '分类已删除，用户端发帖选项已同步');
  }

  async function resetCategories() {
    const ok = await confirm({
      title: '恢复默认分类',
      message: '将恢复为「诗词赏析 / 学习心得 / 原创诗词 / 问答」四个内置分类。自定义分类下若仍有帖子，服务端会拒绝恢复。',
      confirmText: '确认恢复',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/post-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '恢复失败');
      show('已恢复默认分类');
      await load();
    } catch (e: unknown) {
      show((e as Error).message || '恢复失败');
    } finally {
      setBusy(false);
    }
  }

  if (!items) {
    return <div className="flex items-center justify-center py-24 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>;
  }

  const editingPosts = editing ? items.find((c) => c.id === editing.id)?.postCount ?? 0 : 0;
  const renameAffects = editingPosts > 0 && editName.trim() && editName.trim() !== editing?.name;

  return (
    <div className="space-y-6">
      <PageHead title="社区分类" desc="维护学习社区的发帖分类；改名会迁移历史帖子，有帖子的分类需先在「帖子审核」处理完帖子才能删除" />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-c bg-white/50 px-3 py-2 font-ui text-[11px] text-ink-soft">
        <span>分类与帖子数每 15 秒自动同步 · 上次 {formatSyncTime(lastSync)}</span>
        <button onClick={() => refresh()} className="inline-flex items-center gap-1 rounded-full border border-c px-2.5 py-1 transition-ink">
          <RotateCcw className="h-3 w-3" /> 刷新统计
        </button>
      </div>

      <section className="paper-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-ui text-[15px] font-medium text-ink-deep">全部分类（{items.length}）</h2>
          <div className="ml-auto flex gap-2">
            <button onClick={resetCategories} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-50">
              <RotateCcw className="h-3.5 w-3.5" /> 恢复默认
            </button>
            <button onClick={() => openEdit()} disabled={busy} className={primaryBtn} style={{ background: 'var(--btn-grad)' }}>
              <Plus className="h-4 w-4" /> 新增分类
            </button>
          </div>
        </div>
        <p className="mb-4 font-ui text-[11px] text-ink-soft">改名会自动迁移该分类下的历史帖子；有帖子的分类不可删除。用户端发帖选项每 5 秒自动同步。</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((c) => {
            const locked = c.postCount > 0;
            return (
              <div key={c.id} className="rounded-lg border border-c p-4 transition-ink hover:bg-white/50">
                <div className="flex items-center justify-between">
                  <span className="font-brush text-xl text-ink-deep">{c.name}</span>
                  <span className="font-ui text-sm" style={{ color: '#7B8EA1' }}>{c.postCount} 帖</span>
                </div>
                <p className="mt-1 min-h-[32px] font-ui text-xs text-ink-soft">{c.desc}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => openEdit(c)} className="inline-flex items-center gap-1 rounded-lg border border-c px-2.5 py-1 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark">
                    <Pencil className="h-3 w-3" /> 编辑
                  </button>
                  <button
                    onClick={() => removeCategory(c)}
                    disabled={locked}
                    title={locked ? `该分类下还有 ${c.postCount} 条帖子，请先在「帖子审核」中处理完这些帖子再删除` : '删除分类'}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: locked ? '#B9AFA6' : '#A67C7C' }}
                  >
                    <Trash2 className="h-3 w-3" /> 删除
                  </button>
                  {locked && <span className="font-ui text-[11px] text-ink-soft">有 {c.postCount} 条帖子，暂不可删除</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Modal open={!!editing} title={editing && items.some((c) => c.id === editing.id) ? '编辑分类' : '新增分类'} onClose={() => setEditing(null)}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-ui text-xs text-ink-soft">分类名称 *（1-12 字）</label>
            <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="如：格律探讨" />
          </div>
          <div>
            <label className="mb-1 block font-ui text-xs text-ink-soft">分类描述（≤60 字，展示在分类卡片与用户端）</label>
            <textarea className={`${textareaCls} min-h-[80px]`} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="一句话说明这个分类适合发什么内容" />
          </div>
          {renameAffects && (
            <p className="rounded-lg px-3 py-2 font-ui text-[11px] leading-relaxed" style={{ background: 'color-mix(in srgb, #A67C7C 10%, transparent)', color: '#8A5D5D' }}>
              改名保存后，该分类下 {editingPosts} 条历史帖子的分类会同步更新为「{editName.trim()}」，请确认后再保存。
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(null)} className="rounded-lg border border-c px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark">取消</button>
            <button onClick={submitEdit} disabled={busy} className={primaryBtn} style={{ background: 'var(--btn-grad)' }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} 保存
            </button>
          </div>
        </div>
      </Modal>
      {confirm.dialog}
      <Toast msg={msg} />
    </div>
  );
}
