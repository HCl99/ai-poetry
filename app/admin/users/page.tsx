'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { PageHead, AdminTable, Tr, Td, Badge, Pagination, Empty, inputCls } from '@/components/admin/ui';

interface UserRow {
  id: string; email: string; name: string | null; role: string; status: string;
  isSelf: boolean; createdAt: string;
}

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: UserRow[]; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { msg, show } = useToast();
  const size = 10;

  const load = useCallback(async (p = page, query = q, r = role) => {
    const params = new URLSearchParams({ page: String(p), size: String(size) });
    if (query) params.set('q', query);
    if (r) params.set('role', r);
    try {
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      show('用户列表加载失败');
    }
  }, [page, q, role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(1); setPage(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(u: UserRow, payload: { role?: string; status?: string }) {
    const verb = payload.role ? (payload.role === 'admin' ? '设为管理员' : '设为普通用户') : (payload.status === 'disabled' ? '禁用' : '启用');
    if (!confirm(`确定要${verb}「${u.name || u.email}」吗？${payload.status === 'disabled' ? '禁用后该账号将立即无法登录。' : ''}`)) return;
    setBusy(u.id);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, ...payload }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '操作失败');
      show('操作成功');
      load();
    } catch (e: unknown) {
      show((e as Error).message || '操作失败');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHead title="用户管理" desc="角色分配（RBAC）与账号禁用/启用 · 不能操作自己的账号" />

      <div className="paper-card flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="搜索邮箱或昵称，回车确认"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(1); } }}
          />
        </div>
        <select className={`${inputCls} w-auto`} value={role} onChange={(e) => { setRole(e.target.value); setPage(1); load(1, q, e.target.value); }}>
          <option value="">全部角色</option>
          <option value="admin">管理员</option>
          <option value="user">普通用户</option>
        </select>
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-20 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>
      ) : data.items.length === 0 ? (
        <Empty text="没有匹配的用户" />
      ) : (
        <div className="paper-card p-4">
          <AdminTable head={['用户', '角色', '状态', '注册时间', '操作']}>
            {data.items.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <div className="font-medium">{u.name || '未设置'}</div>
                  <div className="text-xs text-ink-soft">{u.email}{u.isSelf ? ' · 我' : ''}</div>
                </Td>
                <Td><Badge status={u.role} /></Td>
                <Td><Badge status={u.status} /></Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{new Date(u.createdAt).toLocaleDateString()}</Td>
                <Td>
                  {u.isSelf ? (
                    <span className="font-ui text-xs text-ink-soft">当前登录账号</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={busy === u.id}
                        onClick={() => act(u, { role: u.role === 'admin' ? 'user' : 'admin' })}
                        className="rounded-lg border border-c px-2.5 py-1 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-50"
                      >
                        {u.role === 'admin' ? '降为用户' : '设为管理员'}
                      </button>
                      <button
                        disabled={busy === u.id}
                        onClick={() => act(u, { status: u.status === 'disabled' ? 'active' : 'disabled' })}
                        className="rounded-lg px-2.5 py-1 font-ui text-xs text-white transition-ink disabled:opacity-50"
                        style={{ background: u.status === 'disabled' ? '#6B8E7B' : '#A67C7C' }}
                      >
                        {u.status === 'disabled' ? '启用' : '禁用'}
                      </button>
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
          </AdminTable>
          <Pagination page={page} size={size} total={data.total} onPage={(p) => { setPage(p); load(p); }} />
        </div>
      )}
      <Toast msg={msg} />
    </div>
  );
}
