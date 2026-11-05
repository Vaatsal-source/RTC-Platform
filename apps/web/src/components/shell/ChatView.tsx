import { useEffect, useState } from 'react';
import { Archive, Bell, Hash, Lock, Search } from 'lucide-react';
import type { ChannelDTO, WorkspaceMemberDTO } from '@repo/shared-types';
import { useAppStore } from '../../store/useAppStore';
import { MessageList } from '../chat/MessageList';
import { Composer } from '../chat/Composer';
import { Avatar } from '../ui';

// Module 6 — "X is typing…". Entries carry an expiry as a safety net in case a stop frame is lost.
function TypingIndicator({ channelId }: { channelId: string }) {
  const typing = useAppStore((s) => s.typing[channelId]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const names = Object.values(typing ?? {}).filter((t) => t.until > now).map((t) => t.name);
  return (
    <div className="h-5 px-5 text-xs italic text-gray-400" aria-live="polite">
      {names.length === 0 ? '' : names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : 'Several people are typing…'}
    </div>
  );
}

interface Props {
  channel: ChannelDTO;
  members: WorkspaceMemberDTO[];
  canModerate: boolean;
  onOpenThread: (id: string) => void;
  onSearch: () => void;
  notifications: React.ReactNode;
}

export function ChatView({ channel, members, canModerate, onOpenThread, onSearch, notifications }: Props) {
  const data = useAppStore((s) => s.messages[channel.id]);
  const online = useAppStore((s) => s.onlineIds);
  const me = useAppStore((s) => s.user)!;
  const isDm = channel.kind === 'dm';
  const peer = channel.dmUser;
  const title = isDm ? (peer?.name ?? 'Direct message') : channel.name;
  const Icon = channel.isArchived ? Archive : channel.kind === 'private' ? Lock : Hash;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[#313338]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-black/20 px-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-white">
          {isDm ? <Avatar name={peer?.name ?? '?'} id={peer?.id} size={24} online={!!(peer && online[peer.id])} /> : <Icon size={22} className="shrink-0 text-[#80848e]" />}
          <h1 className="truncate">{title}</h1>
          {channel.isArchived && <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">Archived</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onSearch} className="flex items-center gap-2 rounded bg-[#1e1f22] px-3 py-1 text-xs text-[#949ba4] transition hover:text-white" aria-label="Search">
            <Search size={14} /> Search
          </button>
          {notifications ?? <Bell size={18} />}
        </div>
      </header>

      <MessageList
        channelId={channel.id}
        data={data}
        members={members}
        myId={me.id}
        canModerate={canModerate}
        readOnly={channel.isArchived}
        showReceipts={channel.kind !== 'public'}
        onOpenThread={onOpenThread}
      />

      <TypingIndicator channelId={channel.id} />
      <Composer
        channelId={channel.id}
        members={members}
        placeholder={isDm ? `Message ${title}` : `Message #${channel.name}`}
        disabled={channel.isArchived}
        disabledReason="This channel is archived and read-only."
      />
    </main>
  );
}
