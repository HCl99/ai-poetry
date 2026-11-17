'use client';

import { useEffect, useState } from 'react';
import {
  GOAL_DESC,
  GOAL_LABEL,
  GOAL_ORDER,
  STAGE_DESC,
  STAGE_LABEL,
  STAGE_ORDER,
  type Goal,
  type Stage,
} from '@/lib/classics';

/**
 * 定方向：首次进入工作台时弹出，让用户自己声明「我在哪个阶段、想往哪个方向学」。
 * 学段决定闯关/测验的题源，方向决定默认题型，后续可在账户设置里随时改。
 */
export function DirectionModal({ onOpenChange }: { onOpenChange?: (open: boolean) => void } = {}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('junior');
  const [goal, setGoal] = useState<Goal>('exam');
  const [saving, setSaving] = useState(false);

  // 外部需要知道是否正在显示，用于避免与新手指引的遮罩叠加
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    fetch('/api/user/stage')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.stage) return;
        setStage(d.stage as Stage);
        if (d.goal) setGoal(d.goal as Goal);
        if (!d.onboarded) setOpen(true);
      })
      .catch(() => {});
  }, []);

  async function submit(skip = false) {
    if (saving) return;
    setSaving(true);
    try {
      const r = await fetch('/api/user/stage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skip ? { onboarded: true } : { stage, goal }),
      });
      if (r.ok) {
        setOpen(false);
        // 学段/方向已变，刷新一次让当前页面的题源与默认题型同步生效
        if (!skip) window.location.reload();
      } else {
        // 保存失败也先关闭：全屏遮罩若关不掉，整个工作台都点不动
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(30,28,24,0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-label="定方向"
      onClick={() => { if (!saving) submit(true); }}
    >
      <div className="paper-card max-h-[88vh] w-full max-w-[680px] overflow-y-auto p-6 md:p-8" onClick={(e) => e.stopPropagation()}>
        <p className="font-ui text-xs tracking-[0.2em] text-ink-soft">定 方 向</p>
        <h2 className="mt-2 font-poem text-xl text-ink-deep md:text-2xl">你处在哪一段，想往哪儿学？</h2>
        <p className="mt-2 font-ui text-sm leading-relaxed text-ink-mid">
          不同阶段该会的诗不一样，考法也不一样。定好之后，背诵闯关和诗词测验只出你这个阶段的内容，之后随时能在账户设置里改。
        </p>

        <div className="mt-6">
          <h3 className="font-ui text-sm font-medium text-ink-deep">现在的阶段</h3>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {STAGE_ORDER.map((s) => {
              const active = stage === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStage(s)}
                  className="rounded-xl border-[1.5px] px-2 py-3 font-ui text-sm transition-ink"
                  style={active
                    ? { borderColor: 'var(--btn-bg)', background: 'var(--btn-bg)', color: 'var(--btn-text)' }
                    : { borderColor: 'var(--border-mid, #D8D2C6)', color: 'var(--ink-mid)' }}
                >
                  {STAGE_LABEL[s]}
                </button>
              );
            })}
          </div>
          <p className="mt-2 font-ui text-xs leading-relaxed text-ink-soft">{STAGE_DESC[stage]}</p>
        </div>

        <div className="mt-5">
          <h3 className="font-ui text-sm font-medium text-ink-deep">思考方向</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {GOAL_ORDER.map((g) => {
              const active = goal === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGoal(g)}
                  className="rounded-xl border-[1.5px] p-3 text-left transition-ink"
                  style={active
                    ? { borderColor: 'var(--btn-bg)', background: 'rgba(107,142,123,0.08)' }
                    : { borderColor: 'var(--border-mid, #D8D2C6)' }}
                >
                  <span className="block font-ui text-sm font-medium text-ink-deep">{GOAL_LABEL[g]}</span>
                  <span className="mt-1 block font-ui text-xs leading-relaxed text-ink-soft">{GOAL_DESC[g]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-7 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => submit(true)}
            className="font-ui text-sm text-ink-soft underline-offset-4 hover:underline"
          >
            先随便逛逛
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => submit(false)}
            className="rounded-xl px-5 py-2.5 font-ui text-sm font-medium transition-ink disabled:opacity-60"
            style={{ background: 'var(--btn-bg)', color: 'var(--btn-text)' }}
          >
            {saving ? '保存中…' : `按${STAGE_LABEL[stage]} · ${GOAL_LABEL[goal]}开始`}
          </button>
        </div>
      </div>
    </div>
  );
}
