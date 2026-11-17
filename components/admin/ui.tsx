'use client';

import type { ReactNode } from 'react';

/** 管理后台通用状态色 */
export const STATUS_COLORS: Record<string, string> = {
  active: '#6B8E7B', disabled: '#A67C7C',
  approved: '#6B8E7B', pending: '#C4A965', rejected: '#A67C7C', withdrawn: '#8B857A',
  open: '#C4A965', resolved: '#6B8E7B',
  admin: '#7B8EA1', user: '#6B8E7B',
};
export const STATUS_LABELS: Record<string, string> = {
  active: '正常', disabled: '已禁用',
  approved: '已通过', pending: '待审核', rejected: '已拒绝', withdrawn: '已撤回',
  open: '待处理', resolved: '已处理',
  admin: '管理员', user: '普通用户',
};

export function Badge({ status, text }: { status: string; text?: string }) {
  const c = STATUS_COLORS[status] || '#8B857A';
  return (
    <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 font-ui text-xs" style={{ background: `${c}1F`, color: c }}>
      {text || STATUS_LABELS[status] || status}
    </span>
  );
}

export function AdminTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="paper-card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr className="bg-paper-dark">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-3 font-ui text-xs font-medium text-ink-soft">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-t border-light transition-ink hover:bg-[rgba(107,142,123,0.08)]">{children}</tr>;
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle font-ui text-sm text-ink-deep ${className}`}>{children}</td>;
}

export function Pagination({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const btn = 'rounded-full border border-c px-3 py-1 font-ui text-xs transition-ink disabled:opacity-40';
  return (
    <div className="flex items-center justify-between pt-3 font-ui text-xs text-ink-soft">
      <span>共 {total} 条 · 第 {page} / {pages} 页</span>
      <div className="flex gap-2">
        <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
        <button className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</button>
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="paper-card p-10 text-center font-ui text-sm text-ink-soft">{text}</div>;
}

export function PageHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h1 className="font-brush text-3xl text-ink-black">{title}</h1>
      <p className="mt-1.5 font-ui text-sm text-ink-soft">{desc}</p>
    </div>
  );
}

export function Modal({ open, title, onClose, children, width = 520 }: { open: boolean; title: string; onClose: () => void; children: ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="paper-card max-h-[86vh] w-full overflow-y-auto p-6" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-brush text-xl text-ink-deep">{title}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-ink hover:bg-paper-dark" aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const inputCls = 'h-10 w-full rounded-lg border border-c bg-white/70 px-3 font-ui text-sm text-ink-deep outline-none transition-ink focus:border-ink-mid';
export const textareaCls = 'w-full rounded-lg border border-c bg-white/70 p-3 font-ui text-sm leading-relaxed text-ink-deep outline-none transition-ink focus:border-ink-mid';
export const primaryBtn = 'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-ui text-sm font-medium text-white transition-ink hover:-translate-y-0.5 disabled:opacity-50';
