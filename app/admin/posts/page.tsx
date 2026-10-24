'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Trash2, XCircle } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHead, AdminTable, Tr, Td, Badge, Pagination, Empty, Modal, textareaCls, primaryBtn } from '@/components/admin/ui';
import { POST_STATUS_LABEL } from '@/lib/community';

interface PostRow {
  id: string; title: string; content: string; category: string;
  status: string; flagReason: string | null; reviewNote: string | null;
  author: string; comments: number; likes: number; createdAt: string;
}

const TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
];

export default function AdminPostsPage() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: PostRow[]; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PostRow | null>(null);
  const [note, setNote] = useState('');
  const [detail, setDetail] = useState<PostRow | null>(null);
  const { msg, show } = useToast();
  const confirm = useConfirm();
  const size = 10;

  const load = useCallback(async (p = page, s = status) => {
    try {
      const res = await fetch(`/api/admin/posts?status=${s}&page=${p}&size=${size}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      show('帖子列表加载失败');
    }
  }, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(1); setPage(1); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(p: PostRow, action: 'approve' | 'reject' | 'delete', reviewNote?: string) {
    const label = action === 'approve' ? '通过' : action === 'reject' ? '拒绝' : '删除';
    const ok = await confirm({
      title: `${label}帖子`,
      message: `确定要${label}《${p.title}》吗？`,
      confirmText: `确认${label}`,
      danger: action === 'delete',
    });
    if (!ok) return;
    setBusy(p.id);
    try {
      const res = await fetch('/api/admin/posts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, action, note: reviewNote }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '操作失败');
      show(`已${label}`);
      if (action === 'delete') setDetail(null);
      load();
    } catch (e: unknown) {
      show((e as Error).message || '操作失败');
    } finally {
      setBusy(null);
    }
  }

  async function submitReject() {
    if (!rejecting) return;
    if (!note.trim()) { show('请填写拒绝原因'); return; }
    const p = rejecting;
    setRejecting(null);
    await act(p, 'reject', note.trim());
    setNote('');
  }

  return (
    <div className="space-y-5">
      <PageHead title="帖子审核" desc="学习社区内容审核 · 敏感词命中的帖子会自动进入待审核队列" />

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className="rounded-full border-[1.5px] px-4 py-1.5 font-ui text-sm transition-ink"
            style={status === t.key
              ? { background: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' }
              : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-20 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>
      ) : data.items.length === 0 ? (
        <Empty text="该状态下暂无帖子" />
      ) : (
        <div className="paper-card p-4">
          <AdminTable head={['标题', '作者', '分类', '互动', '状态', '时间', '操作']}>
            {data.items.map((p) => (
              <Tr key={p.id}>
                <Td className="max-w-[220px]">
                  <button className="truncate text-left font-medium hover:underline" onClick={() => setDetail(p)} title={p.title}>{p.title}</button>
                  {p.flagReason && <div className="text-xs" style={{ color: '#A67C7C' }}>{p.flagReason}</div>}
                </Td>
                <Td>{p.author}</Td>
                <Td>{p.category}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{p.comments} 评 / {p.likes} 赞</Td>
                <Td><Badge status={p.status} text={POST_STATUS_LABEL[p.status]} /></Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{new Date(p.createdAt).toLocaleDateString()}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    {p.status !== 'approved' && (
                      <button disabled={busy === p.id} onClick={() => act(p, 'approve')} className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50" style={{ background: '#6B8E7B' }}>
                        <CheckCircle2 className="h-3 w-3" /> 通过
                      </button>
                    )}
                    {p.status !== 'rejected' && (
                      <button disabled={busy === p.id} onClick={() => { setRejecting(p); setNote(p.reviewNote || ''); }} className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50" style={{ background: '#C4A965' }}>
                        <XCircle className="h-3 w-3" /> 拒绝
                      </button>
                    )}
                    <button disabled={busy === p.id} onClick={() => act(p, 'delete')} className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50" style={{ background: '#A67C7C' }}>
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

      {/* 帖子详情 */}
      <Modal open={!!detail} title={detail?.title || ''} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 font-ui text-xs text-ink-soft">
              <span>{detail.author}</span>
              <span className="rounded-full px-2 py-0.5" style={{ background: 'var(--inset)', color: 'var(--ink-mid)' }}>{detail.category}</span>
              <Badge status={detail.status} text={POST_STATUS_LABEL[detail.status]} />
              <span>{new Date(detail.createdAt).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-line font-ui text-sm leading-relaxed text-ink-deep">{detail.content}</p>
            {detail.reviewNote && (
              <div className="rounded-lg p-3 font-ui text-xs" style={{ background: 'var(--inset)', color: '#A67C7C' }}>
                审核备注：{detail.reviewNote}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 拒绝原因 */}
      <Modal open={!!rejecting} title="拒绝帖子" onClose={() => setRejecting(null)}>
        <div className="space-y-3">
          <p className="font-ui text-sm text-ink-soft">拒绝后帖子不再对社区展示，原因将记录为审核备注。</p>
          <textarea className={`${textareaCls} min-h-[90px]`} placeholder="填写拒绝原因，如：内容与社区主题无关" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setRejecting(null)} className="rounded-lg border border-c px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark">取消</button>
            <button onClick={submitReject} className={primaryBtn} style={{ background: '#C4A965' }}>确认拒绝</button>
          </div>
        </div>
      </Modal>
      {confirm.dialog}
      <Toast msg={msg} />
    </div>
  );
}
