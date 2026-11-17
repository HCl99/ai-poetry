'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, EyeOff, History, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHead, AdminTable, Tr, Td, Badge, Pagination, Empty, Modal, textareaCls, primaryBtn } from '@/components/admin/ui';
import { SHARE_STATUS_LABEL } from '@/lib/shareWorkflow';
import { REVIEW_ACTION_META, ACTOR_ROLE_LABEL } from '@/lib/postReviewMeta';
import { formatSyncTime, useAutoRefresh } from '@/hooks/useAutoRefresh';

interface ShareRow {
  id: string; title: string; style: string; excerpt: string; content: string;
  status: string; statusLabel: string;
  flagReason: string | null; reviewNote: string | null;
  author: string; likes: number; createdAt: string;
}

interface LogRow {
  id: string; action: string;
  fromStatus: string | null; toStatus: string | null;
  operatorName: string; actorRole: string; note: string | null; createdAt: string;
}

type Paged<T> = { items: T[]; total: number };

const TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'withdrawn', label: '已撤回' },
];

function timeText(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function StatusText({ s }: { s: string | null }) {
  if (!s) return <span className="text-ink-soft">—</span>;
  return <span className="font-ui text-xs text-ink-mid">{SHARE_STATUS_LABEL[s] || s}</span>;
}

function LogTimeline({ logs }: { logs: LogRow[] | null }) {
  if (logs === null) return <div className="font-ui text-xs text-ink-soft">正在加载…</div>;
  if (logs.length === 0) return <div className="font-ui text-xs text-ink-soft">暂无记录</div>;
  return (
    <ol className="space-y-2.5">
      {[...logs].reverse().map((l) => {
        const meta = REVIEW_ACTION_META[l.action] || { label: l.action, color: '#8B857A' };
        return (
          <li key={l.id} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} />
            <div className="min-w-0">
              <div className="font-ui text-xs text-ink-deep">
                <span style={{ color: meta.color }}>{meta.label}</span>
                <span className="ml-2 text-ink-soft">{l.operatorName} · {timeText(l.createdAt)}</span>
              </div>
              {l.fromStatus && l.toStatus && (
                <div className="mt-0.5 font-ui text-[11px] text-ink-soft">
                  <StatusText s={l.fromStatus} /> → <StatusText s={l.toStatus} />
                </div>
              )}
              {l.note && <div className="mt-0.5 font-ui text-xs text-ink-soft">备注：{l.note}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function AdminSharesPage() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<ShareRow> | null>(null);
  const [detail, setDetail] = useState<ShareRow | null>(null);
  const [detailLogs, setDetailLogs] = useState<LogRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ row: ShareRow; action: 'reject' | 'takedown' } | null>(null);
  const [note, setNote] = useState('');
  const { msg, show } = useToast();
  const confirm = useConfirm();
  const size = 10;

  const load = useCallback(async (p = page, s = status) => {
    try {
      const res = await fetch(`/api/admin/shares?status=${s}&page=${p}&size=${size}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      show('作品列表加载失败');
    }
  }, [page, status, show]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setData(null);
    load(1);
    setPage(1);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const { lastSync, syncing, refresh } = useAutoRefresh(() => load(page, status), 5000);

  async function act(row: ShareRow, action: 'approve' | 'delete' | 'reject' | 'takedown', reviewNote?: string) {
    const label = action === 'approve' ? '通过' : action === 'reject' ? '拒绝' : action === 'takedown' ? '下架' : '删除';
    if (action !== 'reject' && action !== 'takedown') {
      const ok = await confirm({
        title: `${label}作品`,
        message: `确定要${label}「${row.title}」吗？`,
        confirmText: `确认${label}`,
        danger: action === 'delete',
      });
      if (!ok) return;
    }
    setBusy(row.id);
    try {
      const res = await fetch('/api/admin/shares', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action, note: reviewNote }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '操作失败');
      show(`已${label}`);
      if (action === 'delete') setDetail(null);
      refresh();
    } catch (e: unknown) {
      show((e as Error).message || '操作失败');
    } finally {
      setBusy(null);
    }
  }

  async function submitReview() {
    if (!reviewing) return;
    if (!note.trim()) { show('请填写原因，作者会看到这条备注'); return; }
    const { row, action } = reviewing;
    setReviewing(null);
    await act(row, action, note.trim());
    setNote('');
  }

  async function openDetail(row: ShareRow) {
    setDetail(row);
    setDetailLogs(null);
    try {
      const res = await fetch(`/api/admin/shares/${row.id}/logs`, { cache: 'no-store' });
      setDetailLogs(res.ok ? (await res.json()).items as LogRow[] : []);
    } catch {
      setDetailLogs([]);
    }
  }

  return (
    <div className="space-y-5">
      <PageHead
        title="作品审核"
        desc="作品发布到分享广场先进入待审队列，通过后才会公开展示；作者可随时撤回，管理员可对已发布作品下架。全程留痕可追溯"
      />

      <div className="font-ui text-xs text-ink-soft">
        <Link href="/admin/posts" className="underline underline-offset-2 hover:text-ink-deep">← 返回学习社区帖子审核</Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex items-center gap-2 font-ui text-[11px] text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#6B8E7B' }} /> 队列实时同步 · {formatSyncTime(lastSync)}
          </span>
          <button onClick={() => refresh()} disabled={syncing} className="inline-flex items-center gap-1 rounded-full border border-c px-2.5 py-1 transition-ink disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} /> 立即刷新
          </button>
        </div>
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-20 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>
      ) : data.items.length === 0 ? (
        <Empty text="该状态下暂无作品 · 普通用户在「作品社区」发布到广场后会进入待审核队列" />
      ) : (
        <div className="paper-card p-4">
          <AdminTable head={['作品', '作者', '风格', '点赞', '状态', '时间', '操作']}>
            {data.items.map((row) => (
              <Tr key={row.id}>
                <Td className="max-w-[260px]">
                  <button className="truncate text-left font-medium hover:underline" onClick={() => openDetail(row)} title={row.title}>{row.title}</button>
                  {row.flagReason && <div className="text-xs" style={{ color: '#A67C7C' }}>{row.flagReason}</div>}
                </Td>
                <Td>{row.author}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-mid">{row.style}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{row.likes} 赞</Td>
                <Td><Badge status={row.status} text={SHARE_STATUS_LABEL[row.status] || row.status} /></Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{new Date(row.createdAt).toLocaleDateString()}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    {(row.status === 'pending' || row.status === 'rejected') && (
                      <button disabled={busy === row.id} onClick={() => act(row, 'approve')} className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50" style={{ background: '#6B8E7B' }}>
                        <CheckCircle2 className="h-3 w-3" /> 通过
                      </button>
                    )}
                    {row.status === 'pending' && (
                      <button disabled={busy === row.id} onClick={() => { setReviewing({ row, action: 'reject' }); setNote(''); }} className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50" style={{ background: '#C4A965' }}>
                        <XCircle className="h-3 w-3" /> 拒绝
                      </button>
                    )}
                    {row.status === 'approved' && (
                      <button disabled={busy === row.id} onClick={() => { setReviewing({ row, action: 'takedown' }); setNote(''); }} className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50" style={{ background: '#C4A965' }}>
                        <EyeOff className="h-3 w-3" /> 下架
                      </button>
                    )}
                    {row.status === 'withdrawn' && <span className="font-ui text-xs text-ink-soft">作者已撤回</span>}
                    <button disabled={busy === row.id} onClick={() => act(row, 'delete')} className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50" style={{ background: '#A67C7C' }}>
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

      {/* 作品详情 + 审核时间线 */}
      <Modal open={!!detail} title={detail?.title || ''} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 font-ui text-xs text-ink-soft">
              <span>{detail.author}</span>
              <span className="rounded-full px-2 py-0.5" style={{ background: 'var(--inset)', color: 'var(--ink-mid)' }}>{detail.style}</span>
              <Badge status={detail.status} text={SHARE_STATUS_LABEL[detail.status] || detail.status} />
              <span>{timeText(detail.createdAt)}</span>
            </div>
            <p className="whitespace-pre-line font-brush text-lg leading-relaxed text-ink-deep">{detail.content}</p>
            <p className="font-ui text-xs text-ink-soft">灵感：{detail.excerpt}</p>
            {detail.reviewNote && (
              <div className="rounded-lg p-3 font-ui text-xs" style={{ background: 'var(--inset)', color: '#A67C7C' }}>
                审核备注：{detail.reviewNote}
              </div>
            )}
            {detail.status === 'withdrawn' && (
              <div className="rounded-lg p-3 font-ui text-xs" style={{ background: 'rgba(139,133,122,0.12)', color: '#8B857A' }}>
                该作者已撤回分享，不能再审批放出；如需处理仅可删除。
              </div>
            )}
            <div className="border-t border-light pt-3">
              <div className="mb-2 flex items-center gap-1.5 font-ui text-xs font-medium text-ink-deep">
                <History className="h-3.5 w-3.5" /> 操作历史
              </div>
              <LogTimeline logs={detailLogs} />
            </div>
          </div>
        )}
      </Modal>

      {/* 拒绝 / 下架原因 */}
      <Modal open={!!reviewing} title={reviewing?.action === 'takedown' ? '下架作品' : '拒绝作品'} onClose={() => { setReviewing(null); setNote(''); }}>
        <div className="space-y-3">
          <p className="font-ui text-sm text-ink-soft">
            {reviewing?.action === 'takedown'
              ? '下架后作品会立即从分享广场移除，原因将回显给作者，作者可修改后重新发布。'
              : '拒绝后作品不会展示在广场，原因将回显给作者，作者可修改后重新发布。'}
          </p>
          <textarea className={`${textareaCls} min-h-[90px]`} placeholder="填写原因，如：内容与社区主题无关" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setReviewing(null); setNote(''); }} className="rounded-lg border border-c px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark">取消</button>
            <button onClick={submitReview} className={primaryBtn} style={{ background: '#C4A965' }}>{reviewing?.action === 'takedown' ? '确认下架' : '确认拒绝'}</button>
          </div>
        </div>
      </Modal>
      {confirm.dialog}
      <Toast msg={msg} />
    </div>
  );
}
