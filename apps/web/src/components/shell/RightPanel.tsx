import { Activity as ActivityIcon, FileUp, Hash, MessageSquare, UserPlus, Users } from 'lucide-react';
import type { ActivityDTO, WorkspaceMemberDTO } from '@repo/shared-types';
import { useActivity } from '../../lib/queries';
import { useAppStore, type RightPanel as Tab } from '../../store/useAppStore';
import { Avatar, Spinner } from '../ui';

const KIND_ICON = { message_sent: MessageSquare, user_joined: UserPlus, channel_created: Hash, file_uploaded: FileUp } as const;

const ago = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

function ActivityItem({ a }: { a: ActivityDTO }) {
  const Icon = KIND_ICON[a.kind];
  return (
    <li className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-[#35373c]">
      <Icon size={13} className="mt-0.5 shrink-0 text-[#80848e]" />
      <span className="min-w-0 flex-1 break-words text-xs text-[#b5bac1]">{a.summary}</span>
      <span className="shrink-0 text-[10px] text-gray-500">{ago(a.createdAt)}</span>
    </li>
  );
}

// Right-hand panel (when no thread is open): workspace members with presence, and the activity feed.
export function RightPanel({ workspaceId, members }: { workspaceId: string; members: WorkspaceMemberDTO[] }) {
  const tab = useAppStore((s) => s.rightPanel);
  const setTab = useAppStore((s) => s.setRightPanel);
  const online = useAppStore((s) => s.onlineIds);
  const activity = useActivity(workspaceId, tab === 'activity');

  const withPresence = members.map((m) => ({ ...m, online: !!online[m.userId] }));
  const on = withPresence.filter((m) => m.online);
  const off = withPresence.filter((m) => !m.online);

  const tabBtn = (id: Tab, label: string, Icon: typeof Users) => (
    <button onClick={() => setTab(id)} aria-pressed={tab === id} className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold transition ${tab === id ? 'border-b-2 border-[#5865F2] text-white' : 'border-b-2 border-transparent text-[#949ba4] hover:text-[#dbdee1]'}`}>
      <Icon size={14} />{label}
    </button>
  );

  const group = (title: string, list: typeof withPresence) =>
    list.length > 0 && (
      <div className="mb-3">
        <h4 className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#949ba4]">{title} — {list.length}</h4>
        <div className="mt-1 space-y-0.5">
          {list.map((m) => (
            <div key={m.userId} className={`flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[#35373c] ${m.online ? '' : 'opacity-50'}`}>
              <Avatar name={m.name} id={m.userId} size={28} online={m.online} />
              <span className="truncate text-sm font-medium text-[#dbdee1]">{m.name}</span>
              {m.role === 'admin' && <span className="ml-auto rounded bg-[#23a55a] px-1 text-[9px] font-bold uppercase tracking-wide text-white">Admin</span>}
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <aside className="z-10 flex w-60 shrink-0 flex-col border-l border-black/20 bg-[#2b2d31]" aria-label="Workspace panel">
      <div className="flex shrink-0 border-b border-black/20 shadow-sm">{tabBtn('members', 'Members', Users)}{tabBtn('activity', 'Activity', ActivityIcon)}</div>
      <div className="custom-scrollbar flex-1 overflow-y-auto p-3">
        {tab === 'members' ? <>{group('Online', on)}{group('Offline', off)}</> : activity.isLoading ? <Spinner /> : (
          <ul className="space-y-0.5">
            {(activity.data ?? []).map((a) => <ActivityItem key={a.id} a={a} />)}
            {activity.data?.length === 0 && <p className="p-4 text-center text-xs text-gray-500">Nothing yet</p>}
          </ul>
        )}
      </div>
    </aside>
  );
}
