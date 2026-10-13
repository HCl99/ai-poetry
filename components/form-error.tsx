import { AlertCircle } from 'lucide-react';

/** 表单错误提示：role=alert 保证读屏器即时播报，带警示图标与水墨红配色 */
export function FormError({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm"
      style={{ background: 'rgba(166,124,124,0.1)', color: '#A67C7C' }}
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}
