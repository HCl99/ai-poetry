'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, History, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHead, AdminTable, Tr, Td, Badge, Pagination, Empty, Modal, textareaCls, primaryBtn } from '@/components/admin/ui';
import { POST_STATUS_LABEL } from '@/lib/community';
import { POST_STATUS, canReview } from '@/lib/postWorkflow';
import { REVIEW_ACTION_META, ACTOR_ROLE_LABEL } from '@/lib/postReviewMeta';
import { formatSyncTime, useAutoRefresh } from '@/hooks/useAutoRefresh';

interface PostRow {
  id: string; title: string; content: string; category: string;
  status: string; flagReason: string | null; reviewNote: string | null;
  author: string; comments: number; likes: number; createdAt: string;
}

/** 审核记录：帖子全生命周期的每一次状态变化 */
interface LogRow {
  id: string; postId: string; postTitle: string; action: string;
  fromStatus: string | null; toStatus: string | null;
  operatorName: string; actorRole: string; note: string | null; createdAt: string;
}

type Paged<T> = { items: T[]; total: number };

const TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'withdrawn', label: '已撤回' },
  { key: 'history', label: '操作历史' },
];

function timeText(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function ActionTag({ action }: { action: string }) {
  const meta = REVIEW_ACTION_META[action] || { label: action, color: '#8B857A' };
  return (
    <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 font-ui text-xs" style={{ background: `${meta.color}1F`, color: meta.color }}>
      {meta.label}
    </span>
  );
}

function StatusText({ s }: { s: string | null }) {
  if (!s) return <span className="text-ink-soft">—</span>;
  return <span className="font-ui text-xs text-ink-mid">{POST_STATUS_LABEL[s] || s}</span>;
}

/** 单帖时间线：与全局「操作历史」分栏复用同一份日志数据 */
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
              {l.note && <div className="mt-0.5 font-ui text-xs text-ink-soft">备注：{l.note}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function AdminPostsPage() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<PostRow> | null>(null);
  const [logs, setLogs] = useState<Paged<LogRow> | null>(null);
  const [detailLogs, setDetailLogs] = useState<LogRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PostRow | null>(null);
  const [note, setNote] = useState('');
  const [detail, setDetail] = useState<PostRow | null>(null);
  const { msg, show } = useToast();
  const confirm = useConfirm();
  const size = 10;

  const load = useCallback(async (p = page, s = status) => {
    try {
      const url = s === 'history'
        ? `/api/admin/post-logs?page=${p}&size=${size}`
        : `/api/admin/posts?status=${s}&page=${p}&size=${size}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (s === 'history') setLogs(d);
      else setData(d);
    } catch {
      show(s === 'history' ? '操作历史加载失败' : '帖子列表加载失败');
    }
  }, [page, status, show]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === 'history') setLogs(null);
    else setData(null);
    load(1);
    setPage(1);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // 新投稿、作者撤回、审批动作都会自动出现在队列 / 操作历史里，无需手动刷新页面
  const { lastSync, syncing, refresh } = useAutoRefresh(() => load(page, status), 5000);

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
      refresh();
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

  /** 打开详情时顺带拉取该帖的审核时间线，失败不阻塞正文查看 */
  async function openDetail(p: PostRow) {
    setDetail(p);
    setDetailLogs(null);
    try {
      const res = await fetch(`/api/admin/post-logs?postId=${p.id}&size=20`, { cache: 'no-store' });
      setDetailLogs(res.ok ? (await res.json()).items as LogRow[] : []);
    } catch {
      setDetailLogs([]);
    }
  }

  return (
    <div className="space-y-5">
      <PageHead title="帖子审核" desc="列表直接展示正文摘要，点击标题或「详情」查看全文与操作记录；普通用户发帖先进待审队列，通过后才发布到社区，作者可随时撤回，全程留痕" />

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

      {status === 'history' ? (
        !logs ? (
          <div className="flex items-center justify-center py-20 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>
        ) : logs.items.length === 0 ? (
          <Empty text="暂无审核记录 · 用户发帖或管理员通过 / 拒绝 / 删除帖子后会自动留痕" />
        ) : (
          <div className="paper-card p-4">
            <AdminTable head={['时间', '帖子', '操作', '状态变化', '操作人', '备注']}>
              {logs.items.map((l) => (
                <Tr key={l.id}>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">{timeText(l.createdAt)}</Td>
                  <Td className="max-w-[220px]">
                    <div className="truncate" title={l.postTitle}>{l.postTitle}</div>
                    <div className="text-[10px] text-ink-soft">帖子 #{l.postId}</div>
                  </Td>
                  <Td><ActionTag action={l.action} /></Td>
                  <Td className="whitespace-nowrap"><StatusText s={l.fromStatus} /><span className="mx-1 text-ink-soft">→</span><StatusText s={l.toStatus} /></Td>
                  <Td className="whitespace-nowrap text-xs">
                    {l.operatorName}
                    <div className="text-[10px] text-ink-soft">{ACTOR_ROLE_LABEL[l.actorRole] || l.actorRole}</div>
                  </Td>
                  <Td className="max-w-[220px] text-xs text-ink-soft">{l.note || '—'}</Td>
                </Tr>
              ))}
            </AdminTable>
            <Pagination page={page} size={size} total={logs.total} onPage={(p) => { setPage(p); load(p); }} />
          </div>
        )
      ) : !data ? (
        <div className="flex items-center justify-center py-20 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>
      ) : data.items.length === 0 ? (
        <Empty text="该状态下暂无帖子 · 用普通账号在「学习社区」发帖即可进入待审核队列" />
      ) : (
        <div className="paper-card p-4">
          <AdminTable head={['帖子内容', '作者', '分类', '互动', '状态', '时间', '操作']}>
            {data.items.map((p) => (
              <Tr key={p.id}>
                <Td className="max-w-[300px]">
                  <button className="truncate text-left font-medium hover:underline" onClick={() => openDetail(p)} title={p.title}>{p.title}</button>
                  <p
                    className="mt-1 font-ui text-xs leading-relaxed text-ink-soft"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {p.content}
                  </p>
                  {p.flagReason && <div className="mt-1 text-xs" style={{ color: '#A67C7C' }}>{p.flagReason}</div>}
                  <button onClick={() => openDetail(p)} className="mt-1 font-ui text-[11px] underline underline-offset-2 text-ink-soft hover:text-ink-deep">
                    查看全文与记录
                  </button>
                </Td>
                <Td>{p.author}</Td>
                <Td>{p.category}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{p.comments} 评 / {p.likes} 赞</Td>
                <Td><Badge status={p.status} text={POST_STATUS_LABEL[p.status]} /></Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{new Date(p.createdAt).toLocaleDateString()}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => openDetail(p)} className="rounded-lg border border-c px-2.5 py-1 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark">详情</button>
                    {canReview(p.status) && p.status !== POST_STATUS.APPROVED && (
                      <button disabled={busy === p.id} onClick={() => act(p, 'approve')} className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50" style={{ background: '#6B8E7B' }}>
                        <CheckCircle2 className="h-3 w-3" /> 通过
                      </button>
                    )}
                    {canReview(p.status) && p.status !== POST_STATUS.REJECTED && (
                      <button disabled={busy === p.id} onClick={() => { setRejecting(p); setNote(p.reviewNote || ''); }} className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50" style={{ background: '#C4A965' }}>
                        <XCircle className="h-3 w-3" /> 拒绝
                      </button>
                    )}
                    {!canReview(p.status) && <span className="font-ui text-xs text-ink-soft">作者已撤回</span>}
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

      {/* 帖子详情 + 单帖操作时间线 */}
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
            {detail.status === POST_STATUS.WITHDRAWN && (
              <div className="rounded-lg p-3 font-ui text-xs" style={{ background: 'rgba(139,133,122,0.12)', color: '#8B857A' }}>
                该投稿已由作者撤回，仅可删除，不能再审批放出。
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

      {/* 拒绝原因 */}
      <Modal open={!!rejecting} title="拒绝帖子" onClose={() => setRejecting(null)}>
        <div className="space-y-3">
          {rejecting && (
            <div className="max-h-56 overflow-auto rounded-lg p-3" style={{ background: 'var(--inset)' }}>
              <div className="font-ui text-sm font-medium text-ink-deep">{rejecting.title}</div>
              <p className="mt-1.5 whitespace-pre-line font-ui text-xs leading-relaxed text-ink-mid">{rejecting.content}</p>
            </div>
          )}
          <p className="font-ui text-sm text-ink-soft">拒绝后帖子不再对社区展示，原因将记录为审核备注并回显给作者。</p>
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
