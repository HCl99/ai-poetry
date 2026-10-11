'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthModal } from '@/components/auth-modal';
import { useToast, Toast } from '@/components/toast';

/* ---------- 数据 ---------- */
const FAMOUS_POEMS = [
  { dynasty: '唐', title: '静夜思', author: '李白', tags: ['月', '思乡'], lines: ['床前明月光，', '疑是地上霜。', '举头望明月，', '低头思故乡。'] },
  { dynasty: '唐', title: '春望', author: '杜甫', tags: ['战争', '忧国'], lines: ['国破山河在，', '城春草木深。', '感时花溅泪，', '恨别鸟惊心。'] },
  { dynasty: '宋', title: '水调歌头', author: '苏轼', tags: ['月', '豪放'], lines: ['明月几时有？', '把酒问青天。', '不知天上宫阙，', '今夕是何年。'] },
  { dynasty: '宋', title: '声声慢', author: '李清照', tags: ['婉约', '愁'], lines: ['寻寻觅觅，', '冷冷清清，', '凄凄惨惨戚戚。'] },
  { dynasty: '元', title: '天净沙·秋思', author: '马致远', tags: ['秋', '羁旅'], lines: ['枯藤老树昏鸦，', '小桥流水人家，', '古道西风瘦马。'] },
  { dynasty: '宋', title: '念奴娇·赤壁怀古', author: '苏轼', tags: ['豪放', '咏史'], lines: ['大江东去，', '浪淘尽，', '千古风流人物。'] },
  { dynasty: '唐', title: '山居秋暝', author: '王维', tags: ['山水', '隐逸'], lines: ['空山新雨后，', '天气晚来秋。', '明月松间照，', '清泉石上流。'] },
  { dynasty: '唐', title: '登高', author: '杜甫', tags: ['秋', '悲'], lines: ['风急天高猿啸哀，', '渚清沙白鸟飞回。', '无边落木萧萧下，', '不尽长江滚滚来。'] },
  { dynasty: '唐', title: '锦瑟', author: '李商隐', tags: ['追忆', '典故'], lines: ['锦瑟无端五十弦，', '一弦一柱思华年。'] },
];

const DYNASTY_CLASS: Record<string, string> = {
  唐: 'dynasty-tang',
  宋: 'dynasty-song',
  元: 'dynasty-yuan',
  明清: 'dynasty-mingqing',
};

const NAV_ITEMS = [
  { label: '诗词探索', href: '#explore' },
  { label: 'AI注解', href: '#annotate' },
  { label: '风格迁移', href: '#transfer' },
  { label: '意象图谱', href: '#imagery' },
  { label: '技术架构', href: '#arch' },
];

/* ---------- 图标 ---------- */
function Sparkles({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
    </svg>
  );
}
function BookIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function EditIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}
function NetworkIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" />
      <path d="M12 7.5v4M12 11.5 6.5 17M12 11.5l5.5 5.5" />
    </svg>
  );
}
function LinkIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/* ---------- 水墨Hero背景 ---------- */
function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-x-0 bottom-0 h-[55%] w-full opacity-50" viewBox="0 0 1440 420" preserveAspectRatio="none" fill="none">
        <defs>
          <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7B8EA1" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7B8EA1" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3A3835" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3A3835" stopOpacity="0.02" />
          </linearGradient>
          <radialGradient id="moon" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#C4A965" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#C4A965" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#C4A965" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="1080" cy="110" r="90" fill="url(#moon)" />
        <circle cx="1080" cy="110" r="42" fill="#C4A965" opacity="0.55" />
        <path d="M0 420V300Q180 190 360 260T720 230T1080 280T1440 220V420Z" fill="url(#m1)" />
        <path d="M0 420V350Q240 260 480 320T960 300T1440 330V420Z" fill="url(#m2)" />
        <path d="M220 150q10-14 20 0M260 165q8-12 16 0M1180 170q9-13 18 0" stroke="#5D5853" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      </svg>
      <div className="absolute left-[8%] top-[18%] h-64 w-64 rounded-full blur-[80px]" style={{ background: 'rgba(123,142,161,0.18)' }} />
      <div className="absolute right-[12%] top-[30%] h-56 w-56 rounded-full blur-[70px]" style={{ background: 'rgba(196,169,101,0.15)' }} />
      <div className="absolute bottom-[10%] left-[40%] h-52 w-52 rounded-full blur-[70px]" style={{ background: 'rgba(107,142,123,0.14)' }} />
    </div>
  );
}

/* ---------- 落地页主组件 ---------- */
export function Landing({ isLoggedIn, userName, totalPoems = 57611 }: { isLoggedIn: boolean; userName: string | null; totalPoems?: number }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [filter, setFilter] = useState('全部');
  const { msg, show } = useToast();
  const numLabel = totalPoems >= 10000 ? `${Math.round(totalPoems / 1000) / 10}万+` : `${totalPoems}+`;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12 },
    );
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => {
      window.removeEventListener('scroll', onScroll);
      io.disconnect();
    };
  }, []);

  const filters = ['全部', '唐', '宋', '元'];
  const poems = FAMOUS_POEMS.filter((p) => filter === '全部' || p.dynasty === filter);

  return (
    <div className="min-h-screen">
      {/* ===== 导航栏 ===== */}
      <header className={`fixed inset-x-0 top-0 z-50 h-[68px] transition-ink ${scrolled ? 'glass shadow-ink' : 'bg-transparent'}`}>
        <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full font-brush text-lg text-white shadow-ink" style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)' }}>墨</span>
            <span className="font-brush text-2xl text-ink-deep">墨韵诗心</span>
          </Link>
          <nav className="hidden items-center gap-7 font-ui text-[15px] text-ink-mid lg:flex">
            {NAV_ITEMS.map((n) => (
              <a key={n.href} href={n.href} className="transition-ink hover:text-ink-deep">{n.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link href="/workbench" className="rounded-lg px-5 py-2 font-ui text-sm font-medium text-white shadow-ink transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover" style={{ background: '#3A3835' }}>
                {userName ? `${userName} · 进入工作台` : '进入工作台'}
              </Link>
            ) : (
              <>
                <button onClick={() => setModalOpen(true)} className="rounded-lg border-[1.5px] border-ink-mid/40 px-4 py-2 font-ui text-sm text-ink-deep transition-ink hover:border-ink-deep hover:bg-paper-dark">登录</button>
                <button onClick={() => setModalOpen(true)} className="rounded-lg px-5 py-2 font-ui text-sm font-medium text-white shadow-ink transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover" style={{ background: '#3A3835' }}>开始探索</button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <HeroBackdrop />
        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <div className="anim-fade-up mb-6 flex flex-wrap items-center justify-center gap-2 font-ui text-xs text-ink-mid">
            {['大语言模型', 'RAG向量检索', '引用追溯', 'SSE流式生成'].map((t) => (
              <span key={t} className="rounded-full border border-c bg-paper-light/70 px-3 py-1">{t}</span>
            ))}
          </div>
          <h1 className="anim-fade-up font-brush text-[64px] leading-tight text-ink-black md:text-[88px]" style={{ animationDelay: '0.1s' }}>
            墨韵 <span className="brand-gradient">诗心</span>
          </h1>
          <p className="anim-fade-up mt-3 font-ui text-lg tracking-[0.35em] text-ink-mid md:text-xl" style={{ animationDelay: '0.2s' }}>
            AI 古诗词文化探索平台
          </p>
          <p className="anim-fade-up mx-auto mt-6 max-w-2xl font-ui text-[15px] leading-relaxed text-ink-soft" style={{ animationDelay: '0.3s' }}>
            融合大语言模型与知识库检索增强，基于{numLabel.replace('+', '')}首开源古诗词数据，
            提供诗词探索、智能注解、风格迁移、意象可视化一站式深度文化探索体验。
          </p>
          <div className="anim-fade-up mt-10 flex items-center justify-center gap-4" style={{ animationDelay: '0.4s' }}>
            {isLoggedIn ? (
              <Link href="/workbench" className="rounded-lg px-8 py-3.5 font-ui text-[15px] font-medium text-white shadow-ink transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover" style={{ background: '#3A3835' }}>
                免费试用 →
              </Link>
            ) : (
              <button onClick={() => setModalOpen(true)} className="rounded-lg px-8 py-3.5 font-ui text-[15px] font-medium text-white shadow-ink transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover" style={{ background: '#3A3835' }}>
                免费试用 →
              </button>
            )}
            {!isLoggedIn && (
              <button onClick={() => setModalOpen(true)} className="rounded-lg border-[1.5px] border-ink-mid/40 px-8 py-3.5 font-ui text-[15px] text-ink-deep transition-ink hover:border-ink-deep hover:bg-paper-dark">
                登录 / 注册
              </button>
            )}
          </div>
          <div className="anim-fade-up mt-16 grid grid-cols-2 gap-8 md:grid-cols-4" style={{ animationDelay: '0.5s' }}>
            {[
              { num: numLabel, label: '古诗词' },
              { num: '6项', label: 'AI技术' },
              { num: '35/35', label: '技术满分覆盖' },
              { num: '3个', label: '独家创新' },
            ].map((s) => (
              <div key={s.label}>
                <div className="font-brush text-3xl text-ink-deep md:text-4xl">{s.num}</div>
                <div className="mt-1 font-ui text-xs text-ink-soft">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 诗词探索 ===== */}
      <section id="explore" className="reveal py-24">
        <div className="mx-auto max-w-[1400px] px-6">
          <div className="mb-10 text-center">
            <h2 className="font-brush text-4xl text-ink-black">诗词探索</h2>
            <p className="mt-3 font-ui text-[15px] text-ink-soft">基于{numLabel.replace('+', '')}首开源古诗词数据，按朝代、题材、意象多维浏览检索</p>
          </div>
          <div className="mb-8 flex justify-center gap-3 font-ui">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="rounded-full border-[1.5px] px-5 py-1.5 text-sm transition-ink"
                style={
                  filter === f
                    ? { background: '#3A3835', color: '#FAF8F3', borderColor: '#3A3835' }
                    : { borderColor: '#D4CFC5', color: '#5D5853' }
                }
              >
                {f}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {poems.map((p) => (
              <div
                key={p.title + p.author}
                onClick={() => show(`打开《${p.title}》${p.author}`)}
                className="paper-card paper-card-hover relative cursor-pointer overflow-hidden px-6 py-7"
              >
                <span className="absolute top-0 left-0 h-0.5 w-full opacity-0 transition-ink" style={{ background: 'linear-gradient(90deg,#7B8EA1,#8B7355)' }} />
                <div className="absolute right-4 top-4">
                  <span className={`dynasty-tag ${DYNASTY_CLASS[p.dynasty]}`}>{p.dynasty}</span>
                </div>
                <h3 className="font-brush text-2xl text-ink-deep">{p.title}</h3>
                <p className="mt-1 font-ui text-xs text-ink-soft">{p.author}</p>
                <div className="my-4 ink-divider" />
                <div className="space-y-1 text-center font-serif text-[16px] leading-[2.4] text-ink-mid">
                  {p.lines.map((l, i) => <p key={i}>{l}</p>)}
                </div>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {p.tags.map((t) => (
                    <span key={t} className="rounded-full bg-paper-dark px-2.5 py-0.5 font-ui text-xs text-ink-soft">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== AI注解 ===== */}
      <section id="annotate" className="reveal py-24" style={{ background: 'rgba(250,248,243,0.6)' }}>
        <div className="mx-auto grid max-w-[1400px] items-center gap-14 px-6 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-ui text-xs" style={{ background: 'rgba(107,142,123,0.15)', color: '#6B8E7B' }}>
              <span className="pulse-dot" /> 知识库 · 引用追溯
            </span>
            <h2 className="mt-4 font-brush text-4xl text-ink-black">AI智能注解</h2>
            <p className="mt-4 font-ui text-[15px] leading-relaxed text-ink-soft">
              大模型深度解析字词典故、修辞手法、情感意境，四维度输出——
              <b className="text-ink-mid">字词释义</b>、<b className="text-ink-mid">典故溯源</b>、<b className="text-ink-mid">情感分析</b>、<b className="text-ink-mid">格律分析</b>。
              每条注解均标注出处诗篇与典故源流，向量语义检索与引用追溯让 AI 言之有据。
            </p>
            <div className="mt-6 space-y-3">
              {['字词释义：逐字解析关键字词含义与用法', '典故溯源：追溯意象历史演变与文化源流', '情感分析：还原诗词情感路径与意境层次', '格律分析：自动检测平仄、押韵、对仗'].map((t, i) => (
                <div key={i} className="flex items-start gap-2.5 font-ui text-sm text-ink-mid">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#8B7355' }} />
                  {t}
                </div>
              ))}
            </div>
            <Link href={isLoggedIn ? '/workbench/annotate' : '#'} onClick={(e) => { if (!isLoggedIn) { e.preventDefault(); setModalOpen(true); } }} className="mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3 font-ui text-sm font-medium text-white shadow-ink transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover" style={{ background: '#3A3835' }}>
              <Sparkles className="h-4 w-4" /> 体验AI注解
            </Link>
          </div>
          <div className="paper-card p-8">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-brush text-xl text-ink-deep">静夜思</span>
              <span className="font-ui text-xs text-ink-soft">唐 · 李白</span>
            </div>
            <div className="space-y-1 text-center font-serif text-[16px] leading-[2.4] text-ink-mid">
              {FAMOUS_POEMS[0].lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
            <div className="my-4 ink-divider" />
            <div className="space-y-3">
              {[
                { tag: '字词释义', text: '"疑"字意为"好像"，以错觉写月光之皎洁流转。', cite: '《李太白全集》卷四' },
                { tag: '典故溯源', text: '"明月"自《古诗十九首》"明月何皎皎"以来即为思乡核心意象。', cite: '向量语义检索' },
                { tag: '情感分析', text: '情感路径：静景触发 → 疑惑 → 举头仰望 → 低头怀乡，层层递进。', cite: '参考袁行霈《中国文学史》' },
              ].map((a, i) => (
                <div key={i} className="rounded-lg p-4" style={{ borderLeft: '3px solid #8B7355', background: '#F5F2EC' }}>
                  <div className="mb-1 flex items-center gap-1.5 font-ui text-xs font-medium text-ink-deep">
                    <Sparkles className="h-3.5 w-3.5 text-sepia" /> {a.tag}
                  </div>
                  <p className="font-ui text-sm leading-relaxed text-ink-mid">{a.text}</p>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-ui text-xs" style={{ border: '1px dashed #7B8EA1', color: '#7B8EA1', background: 'rgba(123,142,161,0.06)' }}>
                    <LinkIcon /> {a.cite}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== 风格迁移 ===== */}
      <section id="transfer" className="reveal py-24">
        <div className="mx-auto grid max-w-[1400px] items-center gap-14 px-6 lg:grid-cols-2">
          <div className="paper-card p-8 lg:order-1">
            <div className="mb-5 flex flex-wrap gap-2.5 font-ui">
              {['李白体', '苏轼体', '婉约体', '王维体', '杜甫体'].map((s, i) => (
                <span key={s} className="rounded-full border-[1.5px] px-4 py-1.5 text-sm" style={i === 1 ? { background: '#3A3835', color: '#FAF8F3', borderColor: '#3A3835' } : { borderColor: '#D4CFC5', color: '#5D5853' }}>{s}</span>
              ))}
            </div>
            <div className="rounded-lg border-[1.5px] border-c bg-white/50 p-4 font-ui text-sm text-ink-soft">
              下雨天一个人走回家，路上想起了远方的朋友……
            </div>
            <div className="mt-6 rounded-lg p-6 text-center" style={{ background: '#F5F2EC' }}>
              <p className="font-serif text-lg leading-loose text-ink-deep">莫听穿林打叶声，<br />何妨吟啸且徐行。<br />故人万里应念我，<br />明月清风共此生。</p>
            </div>
            <p className="mt-3 text-right font-ui text-xs text-ink-soft">苏轼体 · 七言绝句</p>
          </div>
          <div className="lg:order-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-ui text-xs" style={{ background: 'rgba(139,115,85,0.15)', color: '#8B7355' }}>
              <span className="pulse-dot" style={{ background: '#8B7355' }} /> AI 风格仿写
            </span>
            <h2 className="mt-4 font-brush text-4xl text-ink-black">诗人风格迁移</h2>
            <p className="mt-4 font-ui text-[15px] leading-relaxed text-ink-soft">
              输入一段现代文，AI 提炼核心意象、匹配诗人的风格特征，逐句炼字，
              将白话转化为李白之飘逸、苏轼之豪放、王维之空灵、杜甫之沉郁。
            </p>
            <Link href={isLoggedIn ? '/workbench/transfer' : '#'} onClick={(e) => { if (!isLoggedIn) { e.preventDefault(); setModalOpen(true); } }} className="mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 hover:shadow-ink-hover" style={{ background: 'linear-gradient(135deg,#7B8EA1,#5D5853)' }}>
              <EditIcon /> 开始风格迁移
            </Link>
          </div>
        </div>
      </section>

      {/* ===== 意象图谱 ===== */}
      <section id="imagery" className="reveal py-24" style={{ background: 'rgba(250,248,243,0.6)' }}>
        <div className="mx-auto max-w-[1400px] px-6">
          <div className="mb-10 text-center">
            <h2 className="font-brush text-4xl text-ink-black">意象图谱</h2>
            <p className="mt-3 font-ui text-[15px] text-ink-soft">可视化诗词意象关联网络，探索文化符号的深层联系</p>
          </div>
          <div className="grid items-center gap-10 lg:grid-cols-5">
            <div className="paper-card relative h-[380px] overflow-hidden lg:col-span-3">
              <svg className="absolute inset-0 h-full w-full">
                <line x1="50%" y1="50%" x2="22%" y2="22%" stroke="#D4CFC5" strokeWidth="1" />
                <line x1="50%" y1="50%" x2="78%" y2="22%" stroke="#D4CFC5" strokeWidth="1" />
                <line x1="50%" y1="50%" x2="22%" y2="78%" stroke="#D4CFC5" strokeWidth="1" />
                <line x1="50%" y1="50%" x2="78%" y2="78%" stroke="#D4CFC5" strokeWidth="1" />
                <line x1="50%" y1="50%" x2="50%" y2="10%" stroke="#D4CFC5" strokeWidth="1" />
                <line x1="50%" y1="50%" x2="88%" y2="50%" stroke="#D4CFC5" strokeWidth="1" />
              </svg>
              <div className="absolute left-1/2 top-1/2 flex h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-brush text-2xl text-paper-light shadow-ink" style={{ background: '#3A3835' }}>月</div>
              {[
                { ch: '乡愁', x: '22%', y: '22%', c: '#6B8E7B' },
                { ch: '孤独', x: '78%', y: '22%', c: '#8B7355' },
                { ch: '思念', x: '22%', y: '78%', c: '#7B8EA1' },
                { ch: '秋', x: '78%', y: '78%', c: '#A67C7C' },
                { ch: '酒', x: '50%', y: '10%', c: '#C4A965' },
                { ch: '柳', x: '88%', y: '50%', c: '#6B8E7B' },
              ].map((n) => (
                <div key={n.ch} className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full font-brush text-lg transition-ink hover:scale-110"
                  style={{ left: n.x, top: n.y, background: `${n.c}26`, color: n.c }}
                  onClick={() => show(`意象「${n.ch}」`)}>
                  {n.ch}
                </div>
              ))}
            </div>
            <div className="space-y-4 lg:col-span-2">
              {[
                { t: '月 → 乡愁', d: '"月"最常与思乡共现，"举头望明月，低头思故乡"成为千年文化密码。', c: '#6B8E7B' },
                { t: '月 → 孤独', d: '月下独酌、对影成三人，明月是孤独者的唯一知己。', c: '#8B7355' },
                { t: '月 → 秋', d: '中秋之月承载团圆之意，秋月清冷映照羁旅愁思。', c: '#A67C7C' },
              ].map((r, i) => (
                <div key={i} className="rounded-lg p-4" style={{ borderLeft: `3px solid ${r.c}`, background: '#FAF8F3', boxShadow: '0 2px 24px rgba(60,50,40,0.06)' }}>
                  <div className="font-ui text-sm font-medium" style={{ color: r.c }}>{r.t}</div>
                  <p className="mt-1 font-ui text-sm leading-relaxed text-ink-mid">{r.d}</p>
                </div>
              ))}
              <Link href={isLoggedIn ? '/workbench/imagery' : '#'} onClick={(e) => { if (!isLoggedIn) { e.preventDefault(); setModalOpen(true); } }} className="inline-flex items-center gap-2 rounded-lg border-[1.5px] border-ink-mid/40 px-6 py-3 font-ui text-sm text-ink-deep transition-ink hover:border-ink-deep hover:bg-paper-dark">
                <NetworkIcon /> 探索完整图谱
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 技术架构 ===== */}
      <section id="arch" className="reveal py-24">
        <div className="mx-auto max-w-[1400px] px-6 text-center">
          <h2 className="font-brush text-4xl text-ink-black">技术架构</h2>
          <p className="mt-3 font-ui text-[15px] text-ink-soft">大模型驱动 · 知识库检索 · 流式生成体验</p>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3 lg:grid-cols-6">
            {[
              { icon: <Sparkles className="h-6 w-6" />, t: '大模型集成', d: '智能注解 + 五种诗人风格仿写，Prompt 限定平仄押韵意象', c: '#7B8EA1' },
              { icon: <EditIcon className="h-6 w-6" />, t: '流式生成', d: 'SSE 逐字输出，注解与创作实时呈现、思考过程可见', c: '#8B7355' },
              { icon: <BookIcon className="h-6 w-6" />, t: '向量检索', d: 'BGE 中文语义向量 · 相似诗篇召回 · 引用追溯', c: '#6B8E7B' },
              { icon: <NetworkIcon className="h-6 w-6" />, t: '诗词语料', d: '五万余首唐诗 + 万名诗人小传 + 核心意象库', c: '#C4A965' },
              { icon: <Sparkles className="h-6 w-6" />, t: '鉴权体系', d: 'NextAuth 登录鉴权，收藏 / 创作 / 历史持久化', c: '#A67C7C' },
              { icon: <LinkIcon className="h-6 w-6" />, t: '引用追溯', d: '每条注解标注真实检索出处，AI 言之有据', c: '#7B8EA1' },
            ].map((x) => (
              <div key={x.t} className="paper-card paper-card-hover p-5 text-left">
                <div style={{ color: x.c }}>{x.icon}</div>
                <h3 className="mt-3 font-ui text-[15px] font-semibold text-ink-deep">{x.t}</h3>
                <p className="mt-1.5 font-ui text-xs leading-relaxed text-ink-soft">{x.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3 font-ui">
            {['Next.js 14', 'TypeScript', 'Prisma', 'MySQL', 'NextAuth', '智谱GLM-4', 'SSE流式', 'Tailwind'].map((t) => (
              <span key={t} className="rounded-full border border-c bg-paper-light px-3.5 py-1 text-xs text-ink-mid">{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 页脚 ===== */}
      <footer className="py-10 text-center" style={{ background: '#2C2C2C' }}>
        <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-2 px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-full font-brush text-base text-white" style={{ background: 'linear-gradient(135deg,#3A3835,#5D5853)', border: '1px solid rgba(245,242,236,0.2)' }}>墨</span>
          <span className="font-brush text-xl" style={{ color: '#F5F2EC' }}>墨韵诗心</span>
          <p className="font-ui text-xs" style={{ color: 'rgba(245,242,236,0.55)' }}>AI古诗词文化探索平台 · 数据来源 chinese-poetry 开源项目（公有领域）</p>
        </div>
      </footer>

      <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <Toast msg={msg} />
    </div>
  );
}
