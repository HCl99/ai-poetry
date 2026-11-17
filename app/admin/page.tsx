'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { PageHead, AdminTable, Tr, Td, Badge, Empty } from '@/components/admin/ui';
import { useToast, Toast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { formatSyncTime, useAutoRefresh } from '@/hooks/useAutoRefresh';

interface Stats {
  metrics: Record<string, number>;
  pendingPosts: { id: string; title: string; category: string; flagReason: string | null; author: string; createdAt: string }[];
  recentUsers: { id: string; email: string; name: string | null; role: string; status: string; createdAt: string }[];
  recentFeedback?: { id: string; type: string; content: string; contact: string | null; createdAt: string }[];
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Stats | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const { msg, show } = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (!r.ok) return;
      setData(await r.json());
    } catch {
      // 网络抖动时保留上一次快照，避免整页回退到加载态
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const { lastSync, syncing, refresh } = useAutoRefresh(load, 10000);

  /** 总览里直接放行待审投稿，不必先跳到审核页 */
  async function quickApprove(p: Stats['pendingPosts'][number]) {
    const ok = await confirm({
      title: '通过帖子',
      message: `确定通过《${p.title}》吗？通过后用户端会自动显示「审核通过」并发布到社区。`,
      confirmText: '确认通过',
    });
    if (!ok) return;
    setActing(p.id);
    try {
      const r = await fetch('/api/admin/posts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, action: 'approve' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '操作失败');
      show('已通过，用户端会自动同步');
      refresh();
    } catch (e: unknown) {
      show((e as Error).message || '操作失败');
    } finally {
      setActing(null);
    }
  }

  if (!data) {
    return <div className="flex items-center justify-center py-24 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>;
  }

  const m = data.metrics;
  const feedback = data.recentFeedback || [];
  const cards = [
    { label: '注册用户', value: m.users, note: `管理员 ${m.admins} · 禁用 ${m.disabledUsers}`, c: '#6B8E7B', href: '/admin/users' },
    { label: '诗词总量', value: m.poems, note: `已注解 ${m.annotations} 首`, c: '#7B8EA1', href: '/admin/poems' },
    { label: '待审核帖子', value: m.postsPending, note: `已通过 ${m.postsApproved} · 已撤回 ${m.postsWithdrawn ?? 0}`, c: '#C4A965', href: '/admin/posts' },
    { label: '待处理反馈', value: m.feedbackOpen, note: `社区评论 ${m.comments} 条`, c: '#A67C7C', href: '/admin/feedback' },
    { label: 'AI 创作作品', value: m.creations, note: `收藏 ${m.favorites} 次`, c: '#8B7355', href: '/admin/posts' },
    { label: '诗人小传', value: m.poets, note: '图谱与时空地图数据源', c: '#5D5853', href: '/admin/categories' },
  ];

  return (
    <div className="space-y-6">
      <PageHead title="数据总览" desc="平台核心数据一览 · 待办可在这里直接处理" />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-c bg-white/50 px-3 py-2 font-ui text-[11px] text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#6B8E7B' }} /> 数据每 10 秒自动同步 · 上次 {formatSyncTime(lastSync)}
        </span>
        <button onClick={() => refresh()} disabled={syncing} className="inline-flex items-center gap-1 rounded-full border border-c px-2.5 py-1 transition-ink disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} /> 立即刷新
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="paper-card block p-5 transition-ink hover:-translate-y-0.5">
            <div className="font-brush text-3xl" style={{ color: card.c }}>{(card.value ?? 0).toLocaleString()}</div>
            <div className="mt-1 font-ui text-xs text-ink-deep">{card.label}</div>
            <div className="mt-0.5 font-ui text-[10px] text-ink-soft">{card.note}</div>
          </Link>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-ui text-[15px] font-medium text-ink-deep">待审核帖子（{data.pendingPosts.length}）· 可直接放行</h2>
          <Link href="/admin/posts" className="font-ui text-xs text-muted-blue hover:underline">全部审核 →</Link>
        </div>
        {data.pendingPosts.length === 0 ? (
          <Empty text="暂无待审核内容" />
        ) : (
          <AdminTable head={['标题', '作者', '分类', '敏感标记', '时间', '操作']}>
            {data.pendingPosts.map((p) => (
              <Tr key={p.id}>
                <Td className="max-w-[280px] truncate">{p.title}</Td>
                <Td>{p.author}</Td>
                <Td>{p.category}</Td>
                <Td>{p.flagReason ? <span className="font-ui text-xs" style={{ color: '#A67C7C' }}>{p.flagReason}</span> : <span className="font-ui text-xs text-ink-soft">-</span>}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{new Date(p.createdAt).toLocaleDateString()}</Td>
                <Td>
                  <button
                    disabled={acting === p.id}
                    onClick={() => quickApprove(p)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50"
                    style={{ background: '#6B8E7B' }}
                  >
                    <CheckCircle2 className="h-3 w-3" /> {acting === p.id ? '处理中' : '通过'}
                  </button>
                </Td>
              </Tr>
            ))}
          </AdminTable>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-ui text-[15px] font-medium text-ink-deep">待处理反馈（{feedback.length}）</h2>
          <Link href="/admin/feedback" className="font-ui text-xs text-muted-blue hover:underline">前往回复 →</Link>
        </div>
        {feedback.length === 0 ? (
          <Empty text="暂无待处理反馈" />
        ) : (
          <AdminTable head={['类型', '内容摘要', '联系方式', '时间']}>
            {feedback.map((f) => (
              <Tr key={f.id}>
                <Td><Badge status={f.type === '功能异常' ? 'rejected' : f.type === '功能建议' ? 'pending' : 'approved'} text={f.type} /></Td>
                <Td className="max-w-[420px] truncate">{f.content}</Td>
                <Td className="text-xs text-ink-soft">{f.contact || '-'}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{new Date(f.createdAt).toLocaleDateString()}</Td>
              </Tr>
            ))}
          </AdminTable>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-ui text-[15px] font-medium text-ink-deep">最近注册用户</h2>
          <Link href="/admin/users" className="font-ui text-xs text-muted-blue hover:underline">用户管理 →</Link>
        </div>
        <AdminTable head={['昵称', '邮箱', '角色', '状态', '注册时间']}>
          {data.recentUsers.map((u) => (
            <Tr key={u.id}>
              <Td>{u.name || '未设置'}</Td>
              <Td className="text-xs">{u.email}</Td>
              <Td><Badge status={u.role} /></Td>
              <Td><Badge status={u.status} /></Td>
              <Td className="whitespace-nowrap text-xs text-ink-soft">{new Date(u.createdAt).toLocaleDateString()}</Td>
            </Tr>
          ))}
        </AdminTable>
      </section>
      {confirm.dialog}
      <Toast msg={msg} />
    </div>
  );
}
