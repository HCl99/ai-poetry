'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Loader2, MessageCircle, PenLine, Send } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { POST_CATEGORIES } from '@/lib/community';

interface PostItem {
  id: string; title: string; content: string; category: string;
  status: string; isMine: boolean; author: string;
  comments: number; likes: number; likedByMe: boolean; createdAt: string;
}
interface CommentItem {
  id: string; parentId: string | null; content: string;
  author: string; isMine: boolean; createdAt: string;
}

const CAT_COLORS: Record<string, string> = {
  '诗词赏析': '#6B8E7B', '学习心得': '#7B8EA1', '原创诗词': '#A67C7C', '问答': '#C4A965',
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StudySquare() {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '', category: '诗词赏析' });
  const [posting, setPosting] = useState(false);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, CommentItem[]>>({});
  const [loadingComments, setLoadingComments] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [pendingLike, setPendingLike] = useState<string | null>(null);
  const { msg, show } = useToast();
  const loadedOnce = useRef(false);

  const load = useCallback(async (p = 1, cat = category) => {
    try {
      const params = new URLSearchParams({ page: String(p), size: '10' });
      if (cat) params.set('category', cat);
      const r = await fetch(`/api/posts?${params}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setPosts(d.items || []);
      setTotal(d.total || 0);
      setPage(p);
    } catch {
      show('学习社区加载失败');
    } finally {
      setLoading(false);
    }
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loadedOnce.current) { loadedOnce.current = true; load(1); }
  }, [load]);

  async function publish() {
    if (posting) return;
    setPosting(true);
    try {
      const r = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '发布失败');
      show(d.flagged ? '已提交，等待管理员审核后展示' : '发布成功');
      setDraft({ title: '', content: '', category: draft.category });
      setComposing(false);
      load(1);
    } catch (e: unknown) {
      show((e as Error).message || '发布失败');
    } finally {
      setPosting(false);
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

  return (
    <div className="space-y-5">
      {/* 发帖入口 / 编辑器 */}
      {composing ? (
        <div className="paper-card space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {POST_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setDraft({ ...draft, category: c })}
                className="rounded-full border-[1.5px] px-3 py-1 font-ui text-xs transition-ink"
                style={draft.category === c
                  ? { borderColor: CAT_COLORS[c], background: `${CAT_COLORS[c]}1F`, color: CAT_COLORS[c] }
                  : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
              >
                {c}
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
          <div className="flex justify-end gap-2">
            <button onClick={() => setComposing(false)} className="rounded-lg border border-c px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark">取消</button>
            <button onClick={publish} disabled={posting} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 disabled:opacity-50" style={{ background: 'var(--btn-grad)' }}>
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 发布
            </button>
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
        {POST_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => { setCategory(c); load(1, c); }}
            className="rounded-full border-[1.5px] px-3 py-1 font-ui text-xs transition-ink"
            style={category === c ? { borderColor: CAT_COLORS[c], background: `${CAT_COLORS[c]}1F`, color: CAT_COLORS[c] } : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* 帖子流 */}
      {loading ? (
        <div className="flex items-center justify-center py-16 font-ui text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载…</div>
      ) : posts.length === 0 ? (
        <div className="paper-card p-8 text-center font-ui text-sm text-ink-soft">还没有帖子 · 发第一帖，开启学习社区</div>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => {
            const cc = CAT_COLORS[p.category] || '#8B857A';
            const list = comments[p.id] || [];
            const roots = list.filter((c) => !c.parentId);
            const repliesOf = (rid: string) => list.filter((c) => c.parentId === rid);
            return (
              <div key={p.id} className="paper-card p-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-brush text-base text-white" style={{ background: cc }}>
                    {(p.author || '客')[0]}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-ui text-sm font-medium text-ink-deep">{p.author}</span>
                      <span className="rounded-full px-2 py-0.5 font-ui text-[10px]" style={{ background: `${cc}1F`, color: cc }}>{p.category}</span>
                      {p.status === 'pending' && p.isMine && (
                        <span className="rounded-full px-2 py-0.5 font-ui text-[10px]" style={{ background: 'rgba(196,169,101,0.15)', color: '#C4A965' }}>待审核 · 仅自己可见</span>
                      )}
                    </div>
                    <span className="font-ui text-xs text-ink-soft">{fmtTime(p.createdAt)}</span>
                  </div>
                </div>
                <h3 className="mt-3 font-serif text-base font-medium text-ink-deep">{p.title}</h3>
                <p className="mt-1.5 whitespace-pre-line font-ui text-sm leading-relaxed text-ink-mid" style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {p.content}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => toggleLike(p)}
                    disabled={pendingLike === p.id || p.status !== 'approved'}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-ui text-xs transition-ink hover:scale-105 disabled:opacity-50"
                    style={p.likedByMe ? { background: 'rgba(166,124,124,0.12)', color: '#A67C7C' } : { background: 'var(--inset)', color: '#8B857A' }}
                  >
                    <Heart style={{ height: 13, width: 13 }} fill={p.likedByMe ? '#A67C7C' : 'none'} /> {p.likes}
                  </button>
                  <button
                    onClick={() => openComment(p)}
                    disabled={p.status !== 'approved'}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-ui text-xs transition-ink hover:scale-105 disabled:opacity-50"
                    style={{ background: 'var(--inset)', color: '#8B857A' }}
                  >
                    <MessageCircle style={{ height: 13, width: 13 }} /> {p.comments}
                  </button>
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
      <Toast msg={msg} />
    </div>
  );
}
