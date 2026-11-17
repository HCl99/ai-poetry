'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Send, Undo2, Users, Loader2, ScrollText, PenLine } from 'lucide-react';
import { useToast, Toast } from '@/components/toast';
import { ScrollCard } from './scroll-card';
import { downloadSharePng } from './share-card';
import { StudySquare } from './study-square';
import {
  SHARE_STATUS, canPublishShare, canWithdrawShare, shareChangeNotice, shareStatusBanner, shareTitle,
} from '@/lib/shareWorkflow';

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
  shareStatus: string;
  reviewNote: string | null;
  flagReason: string | null;
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
  const [tab, setTab] = useState<'works' | 'study'>('works');
  const [composeSignal, setComposeSignal] = useState(0);
  const [mine, setMine] = useState<CreationItem[]>([]);
  const [feed, setFeed] = useState<CreationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<CreationItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { msg, show } = useToast();
  const prevStatus = useRef<Map<string, string>>(new Map());

  /** 导出诗画长卷 PNG：社区创作 → 竖排右起长卷图 */
  async function exportScroll(c: CreationItem) {
    if (scrollTarget) return;
    setScrollTarget(c);
    await new Promise((r) => setTimeout(r, 150));
    try {
      if (!scrollRef.current) throw new Error();
      await downloadSharePng(scrollRef.current, `诗画长卷-${c.style}-${Date.now()}.png`);
      show('已导出诗画长卷');
    } catch (e) {
      console.error('[exportScroll]', e);
      show('长卷导出失败，请重试');
    } finally {
      setScrollTarget(null);
    }
  }

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/community', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const d = await r.json();
      const nextMine: CreationItem[] = d.mine || [];
      // 轮询时对比状态，审核结果变化给一次提示
      for (const c of nextMine) {
        const prev = prevStatus.current.get(c.id);
        if (!prev) continue;
        const notice = shareChangeNotice(
          shareTitle(c.style, c.content).split(' · ')[1] || c.style,
          prev, c.shareStatus, c.reviewNote,
        );
        if (notice) show(notice);
      }
      prevStatus.current = new Map(nextMine.map((c) => [c.id, c.shareStatus]));
      setMine(nextMine);
      setFeed(d.feed || []);
    } catch {
      show('社区数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  /** 发布/撤回自己的作品 */
  async function togglePublish(c: CreationItem) {
    const withdraw = canWithdrawShare(c.shareStatus, true) && c.shareStatus !== SHARE_STATUS.REJECTED;
    if (!withdraw && !canPublishShare(c.shareStatus)) {
      show('当前状态不可操作，请刷新后重试');
      return;
    }
    setPending(c.id);
    try {
      const r = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: withdraw ? 'unpublish' : 'publish', creationId: c.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const next: string = d.shareStatus;
      setMine((list) => list.map((x) => (
        x.id === c.id ? { ...x, shareStatus: next, reviewNote: next === SHARE_STATUS.REJECTED ? x.reviewNote : null } : x
      )));
      if (next === SHARE_STATUS.APPROVED) {
        setFeed((list) => [{ ...c, shareStatus: next, likedByMe: false }, ...list.filter((x) => x.id !== c.id)]);
      } else {
        setFeed((list) => list.filter((x) => x.id !== c.id));
      }
      show(
        next === SHARE_STATUS.PENDING
          ? '已提交审核，通过后会展示在分享广场'
          : next === SHARE_STATUS.APPROVED
            ? '已发布到分享广场'
            : '已从分享广场撤回',
      );
      void load();
    } catch (e: any) {
      show(e?.message || '操作失败');
    } finally {
      setPending(null);
    }
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
        <h1 className="font-brush text-3xl text-ink-black">社区</h1>
        <p className="mt-1.5 font-ui text-sm text-ink-soft">
          作品广场互相品读点赞 · 学习社区发帖交流，敏感内容自动进入人工审核
        </p>
      </div>

      {/* Tab：作品社区 / 学习社区 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {([
            { key: 'works', label: '作品社区' },
            { key: 'study', label: '学习社区' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="rounded-full border-[1.5px] px-4 py-1.5 font-ui text-sm transition-ink"
              style={tab === t.key
                ? { background: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' }
                : { borderColor: 'var(--border-c)', color: 'var(--ink-mid)' }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setTab('study'); setComposeSignal((n) => n + 1); }}
          className="flex items-center gap-1.5 rounded-full px-4 py-1.5 font-ui text-sm transition-ink hover:opacity-90"
          style={{ background: 'var(--btn-grad)', color: '#fff' }}
        >
          <PenLine className="h-3.5 w-3.5" /> 发帖交流
        </button>
      </div>

      {tab === 'study' ? (
        <StudySquare composeSignal={composeSignal} />
      ) : loading ? (
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
                  const cc = styleColor(c.style);
                  const banner = shareStatusBanner(c.shareStatus);
                  const withdrawable = canWithdrawShare(c.shareStatus, true) && c.shareStatus !== SHARE_STATUS.REJECTED;
                  const publishable = canPublishShare(c.shareStatus);
                  const actionLabel = withdrawable ? '撤回' : c.shareStatus === SHARE_STATUS.PRIVATE ? '发布到广场' : '重新发布';
                  return (
                    <div key={c.id} className="paper-card p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full px-2.5 py-0.5 font-ui text-xs" style={{ background: `${cc}1F`, color: cc }}>
                          {c.style}
                        </span>
                        <button
                          onClick={() => togglePublish(c)}
                          disabled={pending === c.id || (!withdrawable && !publishable)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-ui text-xs transition-ink disabled:opacity-50"
                          style={withdrawable
                            ? { background: 'var(--inset)', color: '#A67C7C' }
                            : { background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
                        >
                          <Send style={{ height: 12, width: 12 }} />
                          {actionLabel}
                        </button>
                      </div>
                      {banner && (
                        <div className="mt-3 rounded-lg px-3 py-2 font-ui text-[11px] leading-relaxed" style={{ background: banner.bg, color: banner.color }}>
                          <div className="font-medium">{banner.title}</div>
                          <div className="mt-0.5 opacity-90">{banner.hint}</div>
                          {c.shareStatus === SHARE_STATUS.REJECTED && c.reviewNote && (
                            <div className="mt-1">审核备注：{c.reviewNote}</div>
                          )}
                        </div>
                      )}
                      {c.shareStatus === SHARE_STATUS.APPROVED && (
                        <div className="mt-3 font-ui text-[11px]" style={{ color: '#6B8E7B' }}>已发布在分享广场</div>
                      )}
                      <p className="mt-3 font-brush text-lg leading-relaxed text-ink-deep" style={{ whiteSpace: 'pre-line' }}>
                        {c.content}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="truncate font-ui text-xs text-ink-soft">灵感：{c.excerpt} · {fmtTime(c.createdAt)}</p>
                        <button
                          onClick={() => exportScroll(c)}
                          disabled={scrollTarget?.id === c.id}
                          className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 font-ui text-xs text-ink-mid transition-ink hover:bg-paper-dark disabled:opacity-50"
                          title="导出诗画长卷 PNG"
                        >
                          {scrollTarget?.id === c.id
                            ? <Loader2 style={{ height: 12, width: 12 }} className="animate-spin" />
                            : <ScrollText style={{ height: 12, width: 12 }} />}
                          长卷
                        </button>
                      </div>
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
                          <button
                            onClick={() => exportScroll(c)}
                            disabled={scrollTarget?.id === c.id}
                            className="flex items-center gap-1 rounded-full px-3 py-1.5 font-ui text-xs transition-ink hover:scale-105 disabled:opacity-50"
                            style={{ background: 'var(--inset)', color: '#8B857A' }}
                            title="导出诗画长卷 PNG"
                          >
                            {scrollTarget?.id === c.id
                              ? <Loader2 style={{ height: 12, width: 12 }} className="animate-spin" />
                              : <ScrollText style={{ height: 12, width: 12 }} />}
                            长卷
                          </button>
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
      {/* 离屏诗画长卷：导出目标作品 */}
      {scrollTarget && (
        <div ref={scrollRef} style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }} aria-hidden>
          <ScrollCard
            title={`${scrollTarget.style}新作`}
            subtitle={scrollTarget.isMine ? '诗画长卷 · 我的创作' : `诗友 ${scrollTarget.author} · 作品社区`}
            poemLines={scrollTarget.content.split('\n')}
            note={scrollTarget.excerpt}
            footer={`${fmtTime(scrollTarget.createdAt)} · 墨韵诗心`}
          />
        </div>
      )}
      <Toast msg={msg} />
    </div>
  );
}
