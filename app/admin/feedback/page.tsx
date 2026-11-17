'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Send, Trash2 } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHead, Badge, Pagination, Empty, textareaCls, primaryBtn } from '@/components/admin/ui';
import { formatSyncTime, useAutoRefresh } from '@/hooks/useAutoRefresh';

interface FeedbackRow {
  id: string; type: string; content: string; contact: string | null;
  reply: string | null; status: string;
  user: { name: string; email: string };
  createdAt: string;
}

const TABS = [
  { key: 'open', label: '待处理' },
  { key: 'resolved', label: '已处理' },
];

export default function AdminFeedbackPage() {
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: FeedbackRow[]; total: number } | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // 记录用户已经手动输入过回复的反馈 id，轮询时不能覆盖这些草稿
  const dirtyRef = useRef<Set<string>>(new Set());
  const { msg, show } = useToast();
  const confirm = useConfirm();
  const size = 8;

  const load = useCallback(async (p = page, s = status) => {
    try {
      const res = await fetch(`/api/admin/feedback?status=${s}&page=${p}&size=${size}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d);
      // 轮询时保留正在编辑/已手动输入的内容，其余以服务端最新回复为准
      setReplies((prev) => Object.fromEntries(
        d.items.map((f: FeedbackRow) => [
          f.id,
          editing === f.id || dirtyRef.current.has(f.id)
            ? (prev[f.id] ?? f.reply ?? '')
            : (f.reply || ''),
        ]),
      ));
    } catch {
      show('反馈列表加载失败');
    }
  }, [page, status, editing, show]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(1); setPage(1); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const { lastSync, syncing, refresh } = useAutoRefresh(() => load(page, status), 8000);

  async function send(f: FeedbackRow, action: 'reply' | 'reopen' | 'delete', text?: string) {
    setBusy(f.id);
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'reply' ? { id: f.id, action, reply: text } : { id: f.id, action }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '操作失败');
      show(action === 'reply' ? '已回复并标记处理' : action === 'reopen' ? '已重新打开，回到待处理队列' : '反馈已删除');
      dirtyRef.current.delete(f.id);
      setEditing(null);
      refresh();
    } catch (e: unknown) {
      show((e as Error).message || '操作失败');
    } finally {
      setBusy(null);
    }
  }

  function resolve(f: FeedbackRow) {
    const reply = (replies[f.id] || '').trim();
    if (!reply) { show('请填写回复内容'); return; }
    return send(f, 'reply', reply);
  }

  async function remove(f: FeedbackRow) {
    const ok = await confirm({
      title: '删除反馈',
      message: `确定删除这条来自「${f.user.name}」的反馈吗？删除后不可恢复。`,
      confirmText: '确认删除',
      danger: true,
    });
    if (ok) await send(f, 'delete');
  }

  return (
    <div className="space-y-5">
      <PageHead title="反馈处理" desc="用户意见反馈的查看、回复与处理闭环 · 回复后用户端自动同步" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setStatus(t.key); setEditing(null); }}
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
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#6B8E7B' }} /> 新反馈自动同步 · {formatSyncTime(lastSync)}
          </span>
          <button onClick={() => refresh()} disabled={syncing} className="inline-flex items-center gap-1 rounded-full border border-c px-2.5 py-1 transition-ink disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} /> 立即刷新
          </button>
        </div>
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-20 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>
      ) : data.items.length === 0 ? (
        <Empty text="暂无反馈" />
      ) : (
        <>
          <div className="space-y-4">
            {data.items.map((f) => (
              <div key={f.id} className="paper-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge status={f.type === '功能异常' ? 'rejected' : f.type === '功能建议' ? 'pending' : 'approved'} text={f.type} />
                  <span className="font-ui text-sm font-medium text-ink-deep">{f.user.name}</span>
                  <span className="font-ui text-xs text-ink-soft">{f.user.email}</span>
                  {f.contact && <span className="font-ui text-xs text-ink-soft">联系方式：{f.contact}</span>}
                  <span className="ml-auto font-ui text-xs text-ink-soft">{new Date(f.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 whitespace-pre-line font-ui text-sm leading-relaxed text-ink-deep">{f.content}</p>

                {f.status === 'resolved' && editing !== f.id ? (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg p-3 font-ui text-sm" style={{ background: 'rgba(107,142,123,0.08)', color: '#6B8E7B' }}>
                      官方回复：{f.reply}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        disabled={busy === f.id}
                        onClick={() => { setEditing(f.id); setReplies({ ...replies, [f.id]: f.reply || '' }); }}
                        className="rounded-lg border border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-50"
                      >
                        修改回复
                      </button>
                      <button
                        disabled={busy === f.id}
                        onClick={() => send(f, 'reopen')}
                        className="rounded-lg border border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-50"
                      >
                        重新打开
                      </button>
                      <button
                        disabled={busy === f.id}
                        onClick={() => remove(f)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-ui text-xs text-white transition-ink disabled:opacity-50"
                        style={{ background: '#A67C7C' }}
                      >
                        <Trash2 className="h-3 w-3" /> 删除
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {f.status === 'resolved' && (
                      <p className="font-ui text-xs text-ink-soft">修改回复后重新保存，用户端会自动看到更新后的内容。</p>
                    )}
                    <textarea
                      className={`${textareaCls} min-h-[70px]`}
                      placeholder="填写回复内容…"
                      value={replies[f.id] || ''}
                      onChange={(e) => {
                        dirtyRef.current.add(f.id);
                        setReplies((prev) => ({ ...prev, [f.id]: e.target.value }));
                      }}
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      {f.status === 'resolved' && (
                        <button onClick={() => setEditing(null)} className="rounded-lg border border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark">取消</button>
                      )}
                      <button disabled={busy === f.id} onClick={() => resolve(f)} className={primaryBtn} style={{ background: 'var(--btn-grad)' }}>
                        {busy === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {f.status === 'resolved' ? '保存回复' : '回复并标记已处理'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Pagination page={page} size={size} total={data.total} onPage={(p) => { setPage(p); load(p); }} />
        </>
      )}
      {confirm.dialog}
      <Toast msg={msg} />
    </div>
  );
}
