import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Hash, MessageSquare, Search, Users } from 'lucide-react';
import type { ChannelDTO, UserDTO } from '@repo/shared-types';
import { Api } from '../../lib/api';
import { useAppStore } from '../../store/useAppStore';
import { Avatar, Modal, Spinner, inputCls } from '../ui';

interface Props {
  workspaceId: string | null;
  onClose: () => void;
  onOpenChannel: (c: ChannelDTO) => void;
  onOpenChannelId: (id: string) => void;
  onMessageUser: (u: UserDTO) => void;
}

// Module 11 — messages, users and channels (server side: MongoDB text indexes).
export function SearchModal({ workspaceId, onClose, onOpenChannel, onOpenChannelId, onMessageUser }: Props) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const channelIndex = useAppStore((s) => s.channelIndex);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300); // debounce
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching, isError } = useQuery({ queryKey: ['search', q, workspaceId], queryFn: () => Api.search(q, workspaceId ?? undefined), enabled: q.length >= 2 });
  const empty = data && !data.messages.length && !data.users.length && !data.channels.length;

  return (
    <Modal title="Search" icon={<Search size={18} />} onClose={onClose} wide>
      <input autoFocus className={inputCls} placeholder="Search messages, people and channels…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search" />
      <div className="custom-scrollbar mt-4 max-h-[55vh] space-y-5 overflow-y-auto">
        {q.length < 2 && <p className="py-6 text-center text-xs text-gray-500">Type at least 2 characters</p>}
        {isFetching && <Spinner />}
        {isError && <p className="py-4 text-center text-xs text-rose-400">Search failed</p>}
        {empty && !isFetching && <p className="py-6 text-center text-xs text-gray-500">No results for “{q}”</p>}

        {!!data?.channels.length && (
          <section>
            <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">Channels</h4>
            {data.channels.map((c) => (
              <button key={c.id} onClick={() => { onOpenChannel(c); onClose(); }} className="flex w-full items-center gap-2 rounded p-2 text-left text-sm text-[#dbdee1] hover:bg-[#35373c]"><Hash size={14} className="text-[#80848e]" />{c.name}</button>
            ))}
          </section>
        )}
        {!!data?.users.length && (
          <section>
            <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">People</h4>
            {data.users.map((u) => (
              <button key={u.id} onClick={() => { onMessageUser(u); onClose(); }} className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-[#35373c]">
                <Avatar name={u.name} id={u.id} size={24} /><span className="text-sm text-[#dbdee1]">{u.name}</span><span className="ml-auto flex items-center gap-1 text-[11px] text-[#949ba4]"><Users size={11} />{u.email}</span>
              </button>
            ))}
          </section>
        )}
        {!!data?.messages.length && (
          <section>
            <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">Messages</h4>
            {data.messages.map((m) => {
              const ch = channelIndex[m.channelId];
              return (
                <button key={m.id} onClick={() => { onOpenChannelId(m.channelId); onClose(); }} className="block w-full rounded p-2 text-left hover:bg-[#35373c]">
                  <span className="flex items-center gap-2 text-[11px] text-[#949ba4]"><MessageSquare size={11} />{ch ? (ch.kind === 'dm' ? `DM with ${ch.dmUser?.name ?? '…'}` : `#${ch.name}`) : 'Conversation'} · <b className="text-[#dbdee1]">{m.user.name}</b> · {new Date(m.timestamp).toLocaleDateString()}</span>
                  <span className="mt-0.5 block break-words text-sm text-slate-300">{m.content}</span>
                </button>
              );
            })}
          </section>
        )}
      </div>
    </Modal>
  );
}
