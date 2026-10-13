'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { PageHead, Badge, Pagination, Empty, textareaCls, primaryBtn } from '@/components/admin/ui';

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
  const { msg, show } = useToast();
  const size = 8;

  const load = useCallback(async (p = page, s = status) => {
    try {
      const res = await fetch(`/api/admin/feedback?status=${s}&page=${p}&size=${size}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d);
      setReplies(Object.fromEntries(d.items.map((f: FeedbackRow) => [f.id, f.reply || ''])));
    } catch {
      show('反馈列表加载失败');
    }
  }, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(1); setPage(1); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function resolve(f: FeedbackRow) {
    const reply = (replies[f.id] || '').trim();
    if (!reply) { show('请填写回复内容'); return; }
    setBusy(f.id);
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, reply }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '操作失败');
      show('已回复并标记处理');
      load();
    } catch (e: unknown) {
      show((e as Error).message || '操作失败');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHead title="反馈处理" desc="用户意见反馈的查看、回复与处理闭环" />

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
                {f.status === 'resolved' ? (
                  <div className="mt-3 rounded-lg p-3 font-ui text-sm" style={{ background: 'rgba(107,142,123,0.08)', color: '#6B8E7B' }}>
                    官方回复：{f.reply}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <textarea
                      className={`${textareaCls} min-h-[70px]`}
                      placeholder="填写回复内容…"
                      value={replies[f.id] || ''}
                      onChange={(e) => setReplies({ ...replies, [f.id]: e.target.value })}
                    />
                    <div className="flex justify-end">
                      <button disabled={busy === f.id} onClick={() => resolve(f)} className={primaryBtn} style={{ background: 'var(--btn-grad)' }}>
                        {busy === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 回复并标记已处理
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
      <Toast msg={msg} />
    </div>
  );
}
