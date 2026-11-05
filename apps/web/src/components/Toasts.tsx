import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === 'error' ? AlertCircle : t.kind === 'success' ? CheckCircle2 : Info;
        const tone = t.kind === 'error' ? 'border-rose-500/30 text-rose-300' : t.kind === 'success' ? 'border-emerald-500/30 text-emerald-300' : 'border-indigo-500/30 text-indigo-200';
        return (
          <button key={t.id} onClick={() => dismiss(t.id)} className={`pointer-events-auto flex items-start gap-2 rounded-lg border bg-[#1f2226] p-3 text-left text-xs shadow-xl ${tone}`}>
            <Icon size={14} className="mt-0.5 shrink-0" />
            <span className="break-words">{t.text}</span>
          </button>
        );
      })}
    </div>
  );
}
