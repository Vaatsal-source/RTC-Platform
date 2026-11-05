import { useState } from 'react';
import { AtSign, Bell, CheckCheck, MessageSquare, UserPlus } from 'lucide-react';
import type { NotificationDTO } from '@repo/shared-types';
import { useAppStore } from '../../store/useAppStore';
import { useMarkNotificationsRead } from '../../lib/queries';

const ICONS = { mention: AtSign, message: MessageSquare, invite: UserPlus } as const;

const ago = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Module 9 — mentions, DMs/replies and invites. New ones arrive live over the socket (NOTIFICATION).
export function NotificationsMenu({ onOpen }: { onOpen: (n: NotificationDTO) => void }) {
  const [open, setOpen] = useState(false);
  const items = useAppStore((s) => s.notifications);
  const unread = useAppStore((s) => s.notificationUnread);
  const markRead = useMarkNotificationsRead();

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} aria-expanded={open} className="relative rounded p-1.5 text-[#b5bac1] transition hover:bg-[#35373c] hover:text-white">
        <Bell size={18} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-30 w-96 overflow-hidden rounded-lg border border-black/40 bg-[#111214] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
              <span className="text-sm font-bold text-white">Notifications</span>
              <button disabled={unread === 0} onClick={() => markRead.mutate(undefined)} className="flex items-center gap-1 text-[11px] text-[#00a8fc] hover:underline disabled:opacity-40"><CheckCheck size={12} /> Mark all read</button>
            </div>
            <div className="custom-scrollbar max-h-96 overflow-y-auto">
              {items.length === 0 && <p className="p-6 text-center text-xs text-gray-500">You're all caught up</p>}
              {items.map((n) => {
                const Icon = ICONS[n.kind];
                return (
                  <button key={n.id} onClick={() => { setOpen(false); if (!n.read) markRead.mutate([n.id]); onOpen(n); }} className={`flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition hover:bg-[#1e1f22] ${n.read ? 'opacity-60' : ''}`}>
                    <Icon size={16} className={`mt-0.5 shrink-0 ${n.kind === 'mention' ? 'text-amber-300' : 'text-[#5865F2]'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-xs leading-relaxed text-[#dbdee1]">{n.message}</span>
                      <span className="text-[10px] text-gray-500">{ago(n.createdAt)}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#5865F2]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
