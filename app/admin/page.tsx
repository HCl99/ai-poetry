'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { PageHead, AdminTable, Tr, Td, Badge, Empty } from '@/components/admin/ui';

interface Stats {
  metrics: Record<string, number>;
  pendingPosts: { id: string; title: string; category: string; flagReason: string | null; author: string; createdAt: string }[];
  recentUsers: { id: string; email: string; name: string | null; role: string; status: string; createdAt: string }[];
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats').then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return <div className="flex items-center justify-center py-24 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>;
  }

  const m = data.metrics;
  const cards = [
    { label: '注册用户', value: m.users, note: `管理员 ${m.admins} · 禁用 ${m.disabledUsers}`, c: '#6B8E7B' },
    { label: '诗词总量', value: m.poems, note: `已注解 ${m.annotations} 首`, c: '#7B8EA1' },
    { label: '待审核帖子', value: m.postsPending, note: `已通过 ${m.postsApproved}`, c: '#C4A965' },
    { label: '待处理反馈', value: m.feedbackOpen, note: `社区评论 ${m.comments} 条`, c: '#A67C7C' },
    { label: 'AI 创作作品', value: m.creations, note: `收藏 ${m.favorites} 次`, c: '#8B7355' },
    { label: '诗人小传', value: m.poets, note: '图谱与时空地图数据源', c: '#5D5853' },
  ];

  return (
    <div className="space-y-6">
      <PageHead title="数据总览" desc="平台核心数据一览 · 待办事项优先处理" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="paper-card p-5">
            <div className="font-brush text-3xl" style={{ color: card.c }}>{card.value.toLocaleString()}</div>
            <div className="mt-1 font-ui text-xs text-ink-deep">{card.label}</div>
            <div className="mt-0.5 font-ui text-[10px] text-ink-soft">{card.note}</div>
          </div>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-ui text-[15px] font-medium text-ink-deep">待审核帖子（{data.pendingPosts.length}）</h2>
          <Link href="/admin/posts" className="font-ui text-xs text-muted-blue hover:underline">前往审核 →</Link>
        </div>
        {data.pendingPosts.length === 0 ? (
          <Empty text="暂无待审核内容" />
        ) : (
          <AdminTable head={['标题', '作者', '分类', '敏感标记', '时间']}>
            {data.pendingPosts.map((p) => (
              <Tr key={p.id}>
                <Td className="max-w-[280px] truncate">{p.title}</Td>
                <Td>{p.author}</Td>
                <Td>{p.category}</Td>
                <Td>{p.flagReason ? <span className="font-ui text-xs" style={{ color: '#A67C7C' }}>{p.flagReason}</span> : <span className="font-ui text-xs text-ink-soft">-</span>}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{new Date(p.createdAt).toLocaleDateString()}</Td>
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
    </div>
  );
}
