'use client';

import { useCallback, useEffect, useState } from 'react';
import { Heart, Send, Undo2, Users, Loader2 } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';

interface CreationItem {
  id: string;
  style: string;
  excerpt: string;
  content: string;
  author: string;
  isMine: boolean;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
}

const STYLE_COLORS = ['#6B8E7B', '#7B8EA1', '#A67C7C', '#C4A965', '#8B7355', '#5D5853'];

function styleColor(style: string): string {
  let h = 0;
  for (let i = 0; i < style.length; i++) h = (h * 31 + style.charCodeAt(i)) >>> 0;
  return STYLE_COLORS[h % STYLE_COLORS.length];
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function CommunityView() {
  const [mine, setMine] = useState<CreationItem[]>([]);
  const [feed, setFeed] = useState<CreationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const { msg, show } = useToast();

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/community');
      if (!r.ok) throw new Error();
      const d = await r.json();
      setMine(d.mine || []);
      setFeed(d.feed || []);
    } catch {
      show('社区数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  /** 发布/取消发布自己的作品 */
  async function togglePublish(c: CreationItem) {
    setPending(c.id);
    try {
      const r = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: c.createdAt && isPublished(c) ? 'unpublish' : 'publish', creationId: c.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const published = d.isPublic;
      setMine((list) => list.map((x) => (x.id === c.id ? { ...x, likes: d.likes } : x)));
      if (published) {
        setFeed((list) => [{ ...c, likedByMe: false }, ...list.filter((x) => x.id !== c.id)]);
        show('已发布到分享广场');
      } else {
        setFeed((list) => list.filter((x) => x.id !== c.id));
        show('已从分享广场撤回');
      }
    } catch (e: any) {
      show(e?.message || '操作失败');
    } finally {
      setPending(null);
    }
  }

  /** mine 中该作品当前是否已发布（feed 里存在即已发布） */
  function isPublished(c: CreationItem): boolean {
    return feed.some((x) => x.id === c.id);
  }

  /** 点赞/取消赞（仅分享广场） */
  async function toggleLike(c: CreationItem) {
    if (pending) return;
    setPending(c.id);
    // 乐观更新
    setFeed((list) =>
      list.map((x) =>
        x.id === c.id ? { ...x, likedByMe: !x.likedByMe, likes: x.likes + (x.likedByMe ? -1 : 1) } : x,
      ),
    );
    try {
      const r = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'like', creationId: c.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setFeed((list) => list.map((x) => (x.id === c.id ? { ...x, likedByMe: d.likedByMe, likes: d.likes } : x)));
    } catch (e: any) {
      show(e?.message || '点赞失败');
      setFeed((list) =>
        list.map((x) =>
          x.id === c.id ? { ...x, likedByMe: c.likedByMe, likes: c.likes } : x,
        ),
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-ink-black">作品社区</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          把风格迁移的创作发布到分享广场，与诗友互相品读、点赞交流
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 font-ui text-sm text-ink-soft">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载社区…
        </div>
      ) : (
        <>
          {/* 我的创作 */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
              <Undo2 className="h-4 w-4 text-muted-blue" /> 我的创作（{mine.length}）
            </h2>
            {mine.length === 0 ? (
              <div className="paper-card p-8 text-center font-ui text-sm text-ink-soft">
                还没有创作记录 · 去「风格迁移」写下第一首吧
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {mine.map((c) => {
                  const published = isPublished(c);
                  const cc = styleColor(c.style);
                  return (
                    <div key={c.id} className="paper-card p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full px-2.5 py-0.5 font-ui text-xs" style={{ background: `${cc}1F`, color: cc }}>
                          {c.style}
                        </span>
                        <button
                          onClick={() => togglePublish(c)}
                          disabled={pending === c.id}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-ui text-xs transition-ink disabled:opacity-50"
                          style={published
                            ? { background: 'var(--inset)', color: '#A67C7C' }
                            : { background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
                        >
                          <Send style={{ height: 12, width: 12 }} />
                          {published ? '撤回' : '发布到广场'}
                        </button>
                      </div>
                      <p className="mt-3 font-brush text-lg leading-relaxed text-ink-deep" style={{ whiteSpace: 'pre-line' }}>
                        {c.content}
                      </p>
                      <p className="mt-2 truncate font-ui text-xs text-ink-soft">灵感：{c.excerpt} · {fmtTime(c.createdAt)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 分享广场 */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-ui text-[15px] font-medium text-ink-deep">
              <Users className="h-4 w-4 text-muted-blue" /> 分享广场（{feed.length}）
            </h2>
            {feed.length === 0 ? (
              <div className="paper-card p-8 text-center font-ui text-sm text-ink-soft">
                广场还空着 · 发布你的作品，成为第一位分享者
              </div>
            ) : (
              <div className="space-y-4">
                {feed.map((c) => {
                  const cc = styleColor(c.style);
                  return (
                    <div key={c.id} className="paper-card flex items-start gap-4 p-5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-brush text-lg text-white" style={{ background: cc }}>
                        {(c.author || '客')[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-ui text-sm font-medium text-ink-deep">{c.author}</span>
                          <span className="rounded-full px-2 py-0.5 font-ui text-[10px]" style={{ background: `${cc}1F`, color: cc }}>
                            {c.style}
                          </span>
                          <span className="font-ui text-xs text-ink-soft">{fmtTime(c.createdAt)}</span>
                        </div>
                        <p className="mt-2 font-brush text-lg leading-relaxed text-ink-deep" style={{ whiteSpace: 'pre-line' }}>
                          {c.content}
                        </p>
                        <div className="mt-3 flex items-center gap-3">
                          <button
                            onClick={() => toggleLike(c)}
                            disabled={pending === c.id}
                            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-ui text-xs transition-ink hover:scale-105 disabled:opacity-50"
                            style={c.likedByMe
                              ? { background: 'rgba(166,124,124,0.12)', color: '#A67C7C' }
                              : { background: 'var(--inset)', color: '#8B857A' }}
                            title={c.likedByMe ? '取消点赞' : '点赞'}
                          >
                            <Heart style={{ height: 13, width: 13 }} fill={c.likedByMe ? '#A67C7C' : 'none'} />
                            {c.likes}
                          </button>
                          {c.isMine && <span className="font-ui text-xs" style={{ color: '#6B8E7B' }}>我的作品</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
      <Toast msg={msg} />
    </div>
  );
}
