'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2, RefreshCw, Search } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHead, AdminTable, Tr, Td, Badge, Pagination, Empty, Modal, inputCls } from '@/components/admin/ui';

interface UserRow {
  id: string; email: string; name: string | null; role: string; status: string;
  isSelf: boolean; createdAt: string;
}
interface UserDetail {
  user: UserRow;
  activity: { posts: number; comments: number; creations: number; favorites: number; feedbacks: number };
  recentPosts: { id: string; title: string; status: string; category: string; createdAt: string }[];
}

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: UserRow[]; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { msg, show } = useToast();
  const confirm = useConfirm();
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

  /** 拉取单个用户的真实活跃数据，详情弹窗里可随时刷新 */
  async function openDetail(u: UserRow) {
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '详情加载失败');
      setDetail(d);
    } catch (e: unknown) {
      show((e as Error).message || '详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }

  async function act(u: UserRow, payload: { role?: string; status?: string }) {
    const verb = payload.role ? (payload.role === 'admin' ? '设为管理员' : '设为普通用户') : (payload.status === 'disabled' ? '禁用' : '启用');
    const ok = await confirm({
      title: '确认用户操作',
      message: `确定要${verb}「${u.name || u.email}」吗？${payload.status === 'disabled' ? '禁用后该账号将立即无法登录。' : ''}`,
      confirmText: `确认${verb}`,
      danger: payload.status === 'disabled',
    });
    if (!ok) return;
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
                  <button onClick={() => openDetail(u)} className="text-left font-medium hover:underline" title="查看用户详情">{u.name || '未设置'}</button>
                  <div className="text-xs text-ink-soft">{u.email}{u.isSelf ? ' · 我' : ''}</div>
                </Td>
                <Td><Badge status={u.role} /></Td>
                <Td><Badge status={u.status} /></Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{new Date(u.createdAt).toLocaleDateString()}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openDetail(u)}
                      className="inline-flex items-center gap-1 rounded-lg border border-c px-2.5 py-1 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark"
                    >
                      <Eye className="h-3 w-3" /> 详情
                    </button>
                    {!u.isSelf && (
                      <>
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
                      </>
                    )}
                  </div>
                  {u.isSelf && <div className="mt-1 font-ui text-xs text-ink-soft">当前登录账号</div>}
                </Td>
              </Tr>
            ))}
          </AdminTable>
          <Pagination page={page} size={size} total={data.total} onPage={(p) => { setPage(p); load(p); }} />
        </div>
      )}
      <Modal open={!!detail || detailLoading} title={detail ? `用户详情 · ${detail.user.name || detail.user.email}` : '用户详情'} onClose={() => setDetail(null)}>
        {detailLoading && !detail ? (
          <div className="flex items-center justify-center py-12 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在读取真实活跃数据…</div>
        ) : detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge status={detail.user.role} />
              <Badge status={detail.user.status} />
              <span className="font-ui text-xs text-ink-soft">{detail.user.email}</span>
              <span className="font-ui text-xs text-ink-soft">注册于 {new Date(detail.user.createdAt).toLocaleDateString()}</span>
            </div>

            <div>
              <h4 className="mb-2 font-ui text-xs font-medium text-ink-soft">平台活跃数据（实时查询）</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {([
                  ['投稿', detail.activity.posts], ['评论', detail.activity.comments],
                  ['AI 创作', detail.activity.creations], ['收藏', detail.activity.favorites],
                  ['反馈', detail.activity.feedbacks],
                ] as [string, number][]).map(([label, n]) => (
                  <div key={label} className="rounded-lg p-3" style={{ background: 'var(--inset)' }}>
                    <div className="font-brush text-xl text-ink-deep">{n}</div>
                    <div className="font-ui text-[11px] text-ink-soft">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-ui text-xs font-medium text-ink-soft">最近投稿</h4>
              {detail.recentPosts.length === 0 ? (
                <p className="font-ui text-xs text-ink-soft">该用户还没有发过帖子</p>
              ) : (
                <div className="space-y-2">
                  {detail.recentPosts.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-c px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-ui text-sm text-ink-deep">{p.title}</span>
                      <span className="font-ui text-[11px] text-ink-soft">{p.category}</span>
                      <Badge status={p.status} />
                      <span className="font-ui text-[10px] text-ink-soft">{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={() => openDetail(detail.user)} className="inline-flex items-center gap-1 rounded-lg border border-c px-3 py-1.5 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark">
                <RefreshCw className="h-3 w-3" /> 刷新详情
              </button>
            </div>
          </div>
        )}
      </Modal>
      {confirm.dialog}
      <Toast msg={msg} />
    </div>
  );
}
