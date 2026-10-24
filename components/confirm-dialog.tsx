'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

/** 可调用的确认弹窗：返回 Promise<boolean>，dialog 为待渲染节点 */
export type ConfirmFn = ((options: ConfirmOptions) => Promise<boolean>) & { dialog: ReactNode };

function ConfirmCard({
  options,
  confirmRef,
  onCancel,
  onConfirm,
}: {
  options: ConfirmOptions;
  confirmRef: React.RefObject<HTMLButtonElement>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const messageId = useId();

  return (
    <div
      className="anim-fade-in fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? messageId : undefined}
        className="anim-scale-in paper-card w-full max-w-[420px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="font-brush text-xl text-ink-deep">{options.title}</h3>
        {options.message && (
          <div id={messageId} className="mt-2.5 font-ui text-sm leading-relaxed text-ink-mid">
            {options.message}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-c px-4 py-2 font-ui text-sm text-ink-mid transition-ink hover:bg-paper-dark"
          >
            {options.cancelText || '取消'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5"
            style={{ background: options.danger ? 'var(--rose)' : 'var(--btn-bg)' }}
          >
            {options.confirmText || '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm(): ConfirmFn {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const settle = useCallback((ok: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOptions(null);
    resolve?.(ok);
  }, []);

  const open = useCallback((next: ConfirmOptions) => {
    // 重入保护：上一次尚未结束的询问按取消处理
    resolveRef.current?.(false);
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions(next);
    });
  }, []);

  // 打开期间：锁定滚动、聚焦确认按钮、Esc 取消；关闭后：解锁滚动并还原焦点
  useEffect(() => {
    if (!options) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    confirmRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
      triggerRef.current = null;
    };
  }, [options, settle]);

  return useMemo<ConfirmFn>(
    () =>
      Object.assign((next: ConfirmOptions) => open(next), {
        dialog: options ? (
          <ConfirmCard
            options={options}
            confirmRef={confirmRef}
            onCancel={() => settle(false)}
            onConfirm={() => settle(true)}
          />
        ) : null,
      }),
    [open, options, settle],
  );
}
