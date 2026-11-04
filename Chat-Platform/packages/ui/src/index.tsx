import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Shared presentational components (Tailwind classes; the consuming app must scan this package —
// see `@source` in apps/web/src/index.css). Nothing here knows about the app's state or API.

const PALETTE = ['bg-indigo-600', 'bg-fuchsia-600', 'bg-emerald-600', 'bg-amber-600', 'bg-sky-600', 'bg-rose-600', 'bg-violet-600', 'bg-teal-600'];

/** Stable colour class for a seed (user/workspace id) so the same entity always looks the same. */
export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ name, id, size = 36, online }: { name: string; id?: string; size?: number; online?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className={`flex h-full w-full items-center justify-center rounded-full font-semibold text-white ${colorFor(id ?? name)}`} style={{ fontSize: size * 0.4 }}>
        {name.charAt(0).toUpperCase()}
      </div>
      {online !== undefined && (
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#2b2d31] ${online ? 'bg-emerald-500' : 'bg-[#80848e]'}`} />
      )}
    </div>
  );
}

export function Modal({ title, icon, onClose, children, wide }: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className={`max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-md'} overflow-hidden rounded-lg border border-black/20 bg-[#313338] text-gray-200 shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-black/20 bg-[#2b2d31] p-4">
          <div className="flex items-center gap-2 font-bold text-white">
            {icon}
            <span>{title}</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 transition hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(90vh-60px)] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export const inputCls = 'w-full rounded border border-transparent bg-[#1e1f22] p-2.5 text-sm text-white outline-none transition-all focus:border-[#5865F2]';
export const labelCls = 'text-xs font-bold uppercase tracking-wider text-[#949ba4]';
export const primaryBtn = 'rounded bg-[#5865F2] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-50';

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="rounded border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs font-medium text-rose-400">{children}</p>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-6 text-xs text-gray-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-indigo-400" />
      {label}
    </div>
  );
}
