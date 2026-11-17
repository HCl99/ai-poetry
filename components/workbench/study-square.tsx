'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Loader2, MessageCircle, PenLine, RefreshCw, Send, Undo2 } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import {
  POST_STATUS, canWithdraw, isPubliclyVisible, postStatusBanner,
  reviewChangeNotice, withdrawLabel,
} from '@/lib/postWorkflow';
import { formatSyncTime, useAutoRefresh } from '@/hooks/useAutoRefresh';

interface PostItem {
  id: string; title: string; content: string; category: string;
  status: string; isMine: boolean; author: string;
  reviewNote: string | null; flagReason: string | null;
  comments: number; likes: number; likedByMe: boolean; createdAt: string;
}
interface CommentItem {
  id: string; parentId: string | null; content: string;
  author: string; isMine: boolean; createdAt: string;
}

interface CategoryOption { id: string; name: string; desc: string }

/** 分类由管理端运行时维护，颜色按名称稳定散列，新增分类也能自动获得配色 */
const CAT_PALETTE = ['#6B8E7B', '#7B8EA1', '#A67C7C', '#C4A965', '#8B7355', '#5D5853',
  '#7E6B8E', '#5F8C8B', '#B07D5B', '#6E7FA1', '#8C6F6F', '#7A8A63'];
function catColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CAT_PALETTE[h % CAT_PALETTE.length];
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StudySquare({ composeSignal = 0 }: { composeSignal?: number }) {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '', category: '' });
  const [posting, setPosting] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, CommentItem[]>>({});
  const [loadingComments, setLoadingComments] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [pendingLike, setPendingLike] = useState<string | null>(null);
  const { msg, show } = useToast();
  const confirm = useConfirm();
  // 记录上一次自己投稿的状态，用于轮询时提示「审核通过 / 未通过」
  const prevStatus = useRef<Record<string, string> | null>(null);

  // 外部「发帖交流」入口：切到学习社区时自动展开编辑器
  useEffect(() => {
    if (composeSignal > 0) setComposing(true);
  }, [composeSignal]);

  const load = useCallback(async (p = 1, cat = category, silent = false) => {
    try {
      const params = new URLSearchParams({ page: String(p), size: '10' });
      if (cat) params.set('category', cat);
      // no-store + 定时轮询：管理员在另一端审批后，这里能读到最新状态
      const r = await fetch(`/api/posts?${params}`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const d = await r.json();
      const items: PostItem[] = d.items || [];

      // 累积记录见过的投稿状态，翻页或切分类后仍能检测到状态变化
      const nextMap: Record<string, string> = { ...(prevStatus.current || {}) };
      items.forEach((x) => { if (x.isMine) nextMap[x.id] = x.status; });
      const prev = prevStatus.current;
      prevStatus.current = nextMap;
      if (prev) {
        const changed = items.find((x) => x.isMine && prev[x.id] && prev[x.id] !== x.status);
        if (changed) {
          const notice = reviewChangeNotice(changed.title, prev[changed.id], changed.status, changed.reviewNote);
          if (notice) show(notice);
        }
      }

      setPosts(items);
      setTotal(d.total || 0);
      setPage(p);
    } catch {
      if (!silent) show('学习社区加载失败');
    } finally {
      setLoading(false);
    }
  }, [category, show]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 分类来自管理端运行时配置，管理员增删改后这里会自动同步 */
  const loadCategories = useCallback(async (silent = false) => {
    try {
      const r = await fetch('/api/post-categories', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { items?: CategoryOption[] };
      const items = Array.isArray(d.items) ? d.items : [];
      if (!items.length) return;
      setCategories(items);
      // 选中的分类被管理员删除 / 改名时自动回落，避免筛不到内容或发帖串分类
      if (category && !items.some((c) => c.name === category)) {
        setCategory('');
        void load(1, '', true);
      }
      setDraft((cur) => (items.some((c) => c.name === cur.category) ? cur : { ...cur, category: items[0].name }));
    } catch {
      if (!silent) show('分类加载失败');
    }
  }, [category, load, show]);

  useEffect(() => { load(1, '', false); loadCategories(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 每 5 秒同步一次；标签页不可见时暂停，切回来立即补同步
  const { lastSync, syncing, refresh } = useAutoRefresh(async () => {
    await Promise.all([load(page, category, true), loadCategories(true)]);
  }, 5000);

  async function publish() {
    if (posting) return;
    if (!draft.category) { show('请选择一个分类'); return; }
    setPosting(true);
    try {
      const r = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '发布失败');
      show(d.status === POST_STATUS.PENDING
        ? (d.flagged ? '内容命中敏感词，已提交管理员审核' : '已提交，等待管理员审批')
        : '发布成功（管理员发布，免审）');
      setDraft({ title: '', content: '', category: draft.category });
      setComposing(false);
      load(1, category, true);
    } catch (e: unknown) {
      show((e as Error).message || '发布失败');
    } finally {
      setPosting(false);
    }
  }

  /** 作者撤回：待审核时撤申请，已通过后撤帖子，撤回后管理员也无法再放出 */
  async function withdraw(p: PostItem) {
    if (withdrawing) return;
    const label = withdrawLabel(p.status);
    const ok = await confirm({
      title: `${label}？`,
      message: p.status === POST_STATUS.PENDING
        ? '撤回后这条申请不会再进入管理员的待审队列，也不会对社区展示。'
        : '撤回后帖子立即从社区移除，其他人不再可见，管理员也无法再次审批放出。此操作不可撤销。',
      confirmText: `确认${label}`,
      danger: true,
    });
    if (!ok) return;
    setWithdrawing(p.id);
    try {
      const r = await fetch(`/api/posts/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'withdraw' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '撤回失败');
      setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, status: POST_STATUS.WITHDRAWN } : x)));
      prevStatus.current = { ...(prevStatus.current || {}), [p.id]: POST_STATUS.WITHDRAWN };
      show('已撤回投稿');
    } catch (e: unknown) {
      show((e as Error).message || '撤回失败');
    } finally {
      setWithdrawing(null);
    }
  }

  async function toggleLike(p: PostItem) {
    if (pendingLike) return;
    setPendingLike(p.id);
    // 乐观更新
    setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, likedByMe: !x.likedByMe, likes: x.likes + (x.likedByMe ? -1 : 1) } : x)));
    try {
      const r = await fetch(`/api/posts/${p.id}/like`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '点赞失败');
      setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, likedByMe: d.likedByMe, likes: d.likes } : x)));
    } catch (e: unknown) {
      show((e as Error).message || '点赞失败');
      setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, likedByMe: p.likedByMe, likes: p.likes } : x)));
    } finally {
      setPendingLike(null);
    }
  }

  async function openComment(p: PostItem) {
    if (openComments.has(p.id)) {
      setOpenComments((s) => { const n = new Set(s); n.delete(p.id); return n; });
      return;
    }
    setOpenComments((s) => new Set(s).add(p.id));
    if (!comments[p.id]) {
      setLoadingComments(p.id);
      try {
        const r = await fetch(`/api/posts/${p.id}/comments`);
        const d = await r.json();
        setComments((m) => ({ ...m, [p.id]: d.items || [] }));
      } catch {
        show('评论加载失败');
      } finally {
        setLoadingComments(null);
      }
    }
  }

  async function submitComment(p: PostItem, parentId: string | null) {
    const text = (replyText[parentId ? `r:${parentId}` : p.id] || '').trim();
    if (!text) { show('请输入评论内容'); return; }
    try {
      const r = await fetch(`/api/posts/${p.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, parentId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '评论失败');
      setComments((m) => ({ ...m, [p.id]: [...(m[p.id] || []), d as CommentItem] }));
      setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, comments: x.comments + 1 } : x)));
      setReplyText((m) => ({ ...m, [parentId ? `r:${parentId}` : p.id]: '' }));
    } catch (e: unknown) {
      show((e as Error).message || '评论失败');
    }
  }

  const pages = Math.max(1, Math.ceil(total / 10));
  const mine = posts.filter((p) => p.isMine);
  const countOf = (s: string) => mine.filter((p) => p.status === s).length;

  return (
    <div className="space-y-5">
      {/* 发帖入口 / 编辑器 */}
      {composing ? (
        <div className="paper-card space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setDraft({ ...draft, category: c.name })}
                title={c.desc}
                className="rounded-full border-[1.5px] px-3 py-1 font-ui text-xs transition-ink"
                style={draft.category === c.name
                  ? { borderColor: catColor(c.name), background: `${catColor(c.name)}1F`, color: catColor(c.name) }
                  : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
              >
                {c.name}
              </button>
            ))}
          </div>
          <input
            className="h-10 w-full rounded-lg border border-c bg-white/70 px-3 font-ui text-sm text-ink-deep outline-none transition-ink focus:border-ink-mid"
            placeholder="标题（2-60 字）"
            maxLength={60}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <textarea
            className="min-h-[110px] w-full rounded-lg border border-c bg-white/70 p-3 font-ui text-sm leading-relaxed text-ink-deep outline-none transition-ink focus:border-ink-mid"
            placeholder="分享你的赏析、心得、原创或疑问…（5-2000 字）"
            maxLength={2000}
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-ui text-[11px] text-ink-soft">发帖后先由管理员审批，通过后自动对社区展示</span>
            <div className="flex gap-2">
              <button onClick={() => setComposing(false)} className="rounded-lg border border-c px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark">取消</button>
              <button onClick={publish} disabled={posting} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 disabled:opacity-50" style={{ background: 'var(--btn-grad)' }}>
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 提交审核
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setComposing(true)} className="paper-card flex w-full items-center gap-2 p-4 text-left transition-ink hover:bg-paper-dark">
          <PenLine className="h-4 w-4 text-muted-blue" />
          <span className="font-ui text-sm text-ink-soft">发帖交流：诗词赏析 / 学习心得 / 原创诗词 / 问答…</span>
        </button>
      )}

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setCategory(''); load(1, ''); }}
          className="rounded-full border-[1.5px] px-3 py-1 font-ui text-xs transition-ink"
          style={!category ? { background: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' } : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
        >
          全部
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => { setCategory(c.name); load(1, c.name); }}
            title={c.desc}
            className="rounded-full border-[1.5px] px-3 py-1 font-ui text-xs transition-ink"
            style={category === c.name ? { borderColor: catColor(c.name), background: `${catColor(c.name)}1F`, color: catColor(c.name) } : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* 我的投稿状态栏：管理员审批结果会在这里与卡片上自动刷新 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-c bg-white/50 px-3 py-2 font-ui text-[11px] text-ink-soft">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#6B8E7B' }} /> 审核状态实时同步中
          </span>
          <span>本页我的投稿：审批中 {countOf(POST_STATUS.PENDING)} · 已通过 {countOf(POST_STATUS.APPROVED)} · 未通过 {countOf(POST_STATUS.REJECTED)} · 已撤回 {countOf(POST_STATUS.WITHDRAWN)}</span>
          <span>上次同步 {formatSyncTime(lastSync)}</span>
        </span>
        <button onClick={() => refresh()} disabled={syncing} className="inline-flex items-center gap-1 rounded-full border border-c px-2.5 py-1 transition-ink disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} /> 立即刷新
        </button>
      </div>

      {/* 帖子流 */}
      {loading ? (
        <div className="flex items-center justify-center py-16 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>
      ) : posts.length === 0 ? (
        <div className="paper-card p-8 text-center font-ui text-sm text-ink-soft">还没有帖子 · 发第一帖，开启学习社区</div>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => {
            const cc = catColor(p.category);
            const list = comments[p.id] || [];
            const roots = list.filter((c) => !c.parentId);
            const repliesOf = (rid: string) => list.filter((c) => c.parentId === rid);
            const banner = p.isMine ? postStatusBanner(p.status) : null;
            const publicPost = isPubliclyVisible(p.status);
            const withdrawable = canWithdraw(p.status, p.isMine);
            return (
              <div key={p.id} className="paper-card p-5">
                {/* 状态横幅：仅作者可见，覆盖待审 / 未通过 / 已撤回 */}
                {banner && (
                  <div className="mb-3.5 flex items-start gap-2 rounded-lg px-3 py-2.5 font-ui text-xs" style={{ background: banner.bg, color: banner.color }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: banner.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{banner.title}</div>
                      <div className="mt-0.5 leading-relaxed opacity-85">{banner.hint}</div>
                      {p.reviewNote && p.status === POST_STATUS.REJECTED && (
                        <div className="mt-1 leading-relaxed">审核备注：{p.reviewNote}</div>
                      )}
                      {p.flagReason && p.status === POST_STATUS.PENDING && (
                        <div className="mt-1 leading-relaxed">标记：{p.flagReason}</div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-brush text-base text-white" style={{ background: cc }}>
                    {(p.author || '客')[0]}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-ui text-sm font-medium text-ink-deep">{p.author}</span>
                      <span className="rounded-full px-2 py-0.5 font-ui text-[10px]" style={{ background: `${cc}1F`, color: cc }}>{p.category}</span>
                      {p.isMine && p.status === POST_STATUS.APPROVED && (
                        <span className="rounded-full px-2 py-0.5 font-ui text-[10px]" style={{ background: 'rgba(107,142,123,0.15)', color: '#6B8E7B' }}>已通过审核 · 社区可见</span>
                      )}
                    </div>
                    <span className="font-ui text-xs text-ink-soft">{fmtTime(p.createdAt)}</span>
                  </div>
                </div>
                <h3 className="mt-3 font-serif text-base font-medium text-ink-deep">{p.title}</h3>
                <p className="mt-1.5 whitespace-pre-line font-ui text-sm leading-relaxed text-ink-mid" style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {p.content}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => toggleLike(p)}
                    disabled={pendingLike === p.id || !publicPost}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-ui text-xs transition-ink hover:scale-105 disabled:opacity-50"
                    style={p.likedByMe ? { background: 'rgba(166,124,124,0.12)', color: '#A67C7C' } : { background: 'var(--inset)', color: '#8B857A' }}
                  >
                    <Heart style={{ height: 13, width: 13 }} fill={p.likedByMe ? '#A67C7C' : 'none'} /> {p.likes}
                  </button>
                  <button
                    onClick={() => openComment(p)}
                    disabled={!publicPost}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-ui text-xs transition-ink hover:scale-105 disabled:opacity-50"
                    style={{ background: 'var(--inset)', color: '#8B857A' }}
                  >
                    <MessageCircle style={{ height: 13, width: 13 }} /> {p.comments}
                  </button>
                  {withdrawable && (
                    <button
                      onClick={() => withdraw(p)}
                      disabled={withdrawing === p.id}
                      className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-ui text-xs transition-ink hover:scale-105 disabled:opacity-50"
                      style={{ background: 'var(--inset)', color: '#8B857A' }}
                      title="撤回后管理员也无法再次放出该投稿"
                    >
                      <Undo2 style={{ height: 13, width: 13 }} /> {withdrawLabel(p.status)}
                    </button>
                  )}
                </div>

                {/* 评论楼中楼 */}
                {openComments.has(p.id) && (
                  <div className="mt-4 border-t border-light pt-4">
                    {loadingComments === p.id ? (
                      <div className="flex items-center gap-2 py-3 font-ui text-xs text-ink-soft"><Loader2 className="h-3 w-3 animate-spin" /> 加载评论…</div>
                    ) : (
                      <>
                        {roots.length === 0 && <p className="py-2 font-ui text-xs text-ink-soft">还没有评论，来说两句吧</p>}
                        <div className="space-y-3">
                          {roots.map((c) => (
                            <div key={c.id}>
                              <div className="flex items-start gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-brush text-xs text-white" style={{ background: cc }}>{c.author[0]}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="font-ui text-xs text-ink-soft">{c.author} · {fmtTime(c.createdAt)}</div>
                                  <p className="mt-0.5 whitespace-pre-line font-ui text-sm text-ink-deep">{c.content}</p>
                                </div>
                              </div>
                              {repliesOf(c.id).length > 0 && (
                                <div className="ml-8 mt-2 space-y-2 border-l-2 pl-3" style={{ borderColor: 'var(--border-c)' }}>
                                  {repliesOf(c.id).map((r) => (
                                    <div key={r.id}>
                                      <div className="font-ui text-xs text-ink-soft">{r.author} · {fmtTime(r.createdAt)}</div>
                                      <p className="mt-0.5 whitespace-pre-line font-ui text-sm text-ink-mid">{r.content}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="ml-8 mt-2 flex gap-2">
                                <input
                                  className="h-8 flex-1 rounded-full border border-c bg-white/70 px-3 font-ui text-xs text-ink-deep outline-none transition-ink focus:border-ink-mid"
                                  placeholder={`回复 ${c.author}…`}
                                  maxLength={500}
                                  value={replyText[`r:${c.id}`] || ''}
                                  onChange={(e) => setReplyText((m) => ({ ...m, [`r:${c.id}`]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') submitComment(p, c.id); }}
                                />
                                <button onClick={() => submitComment(p, c.id)} className="rounded-full px-3 py-1 font-ui text-xs text-white transition-ink" style={{ background: 'var(--btn-bg)' }}>回复</button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <input
                            className="h-9 flex-1 rounded-full border border-c bg-white/70 px-3 font-ui text-xs text-ink-deep outline-none transition-ink focus:border-ink-mid"
                            placeholder="发表评论…（1-500 字）"
                            maxLength={500}
                            value={replyText[p.id] || ''}
                            onChange={(e) => setReplyText((m) => ({ ...m, [p.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') submitComment(p, null); }}
                          />
                          <button onClick={() => submitComment(p, null)} className="rounded-full px-4 py-1.5 font-ui text-xs text-white transition-ink" style={{ background: 'var(--btn-bg)' }}>评论</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {pages > 1 && (
            <div className="flex items-center justify-between pt-1 font-ui text-xs text-ink-soft">
              <span>共 {total} 帖 · 第 {page} / {pages} 页</span>
              <div className="flex gap-2">
                <button className="rounded-full border border-c px-3 py-1 transition-ink disabled:opacity-40" disabled={page <= 1} onClick={() => load(page - 1)}>上一页</button>
                <button className="rounded-full border border-c px-3 py-1 transition-ink disabled:opacity-40" disabled={page >= pages} onClick={() => load(page + 1)}>下一页</button>
              </div>
            </div>
          )}
        </div>
      )}
      {confirm.dialog}
      <Toast msg={msg} />
    </div>
  );
}
