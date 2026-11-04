import { useState } from 'react';
import { Archive, ChevronDown, Hash, LogOut, Lock, Plus, Settings, UserPlus } from 'lucide-react';
import type { ChannelDTO, WorkspaceDTO } from '@repo/shared-types';
import { useAppStore } from '../../store/useAppStore';
import { Avatar } from '../ui';

interface Props {
  workspace: WorkspaceDTO;
  channels: ChannelDTO[];
  dms: ChannelDTO[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onCreateChannel: () => void;
  onNewDm: () => void;
  onInvite: () => void;
  onWorkspaceSettings: () => void;
  onChannelSettings: (c: ChannelDTO) => void;
  onLogout: () => void;
}

function UnreadBadge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="ml-auto min-w-[18px] rounded-full bg-rose-500 px-1.5 text-center text-[10px] font-bold text-white">{n > 99 ? '99+' : n}</span>;
}

export function Sidebar(p: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const unread = useAppStore((s) => s.unread);
  const online = useAppStore((s) => s.onlineIds);
  const connected = useAppStore((s) => s.connected);
  const user = useAppStore((s) => s.user)!;
  const isAdmin = p.workspace.myRole === 'admin';

  return (
    <aside className="relative z-10 flex w-60 shrink-0 flex-col bg-[#2b2d31]">
      <button onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} className="relative flex h-12 items-center justify-between border-b border-black/20 px-4 font-bold text-white shadow-sm transition-colors hover:bg-[#35373c]">
        <span className="truncate text-[15px] tracking-wide">{p.workspace.name}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
          <div role="menu" className="absolute left-2 right-2 top-12 z-30 rounded-md border border-black/40 bg-[#111214] p-1.5 shadow-xl">
            {isAdmin && <button role="menuitem" onClick={() => { setMenuOpen(false); p.onInvite(); }} className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-xs font-medium text-indigo-400 transition-colors hover:bg-[#4752c4] hover:text-white">Invite people <UserPlus size={14} /></button>}
            <button role="menuitem" onClick={() => { setMenuOpen(false); p.onWorkspaceSettings(); }} className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-xs font-medium text-[#dbdee1] transition-colors hover:bg-[#4752c4] hover:text-white">Workspace settings <Settings size={14} /></button>
          </div>
        </>
      )}

      <div className="custom-scrollbar flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-5">
          <div className="mb-1 flex items-center justify-between px-2 text-[#949ba4]">
            <p className="text-[11px] font-bold uppercase tracking-wider">Channels</p>
            <button onClick={p.onCreateChannel} aria-label="Create channel" title="Create channel" className="p-0.5 transition-colors hover:text-[#dbdee1]"><Plus size={14} /></button>
          </div>
          <div className="space-y-0.5">
            {p.channels.map((c) => {
              const active = p.activeChannelId === c.id;
              const n = unread[c.id] ?? 0;
              const Icon = c.isArchived ? Archive : c.kind === 'private' ? Lock : Hash;
              return (
                <div key={c.id} className="group relative">
                  <button onClick={() => p.onSelectChannel(c.id)} aria-current={active} className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-[15px] font-medium transition-colors ${active ? 'bg-[#3f4248] text-white' : n ? 'text-white hover:bg-[#36373d]' : 'text-[#949ba4] hover:bg-[#36373d] hover:text-[#dbdee1]'} ${c.isArchived ? 'italic opacity-70' : ''}`}>
                    <Icon size={16} className={active ? 'text-white' : 'text-[#80848e]'} />
                    <span className="truncate">{c.name}</span>
                    {!active && <UnreadBadge n={n} />}
                  </button>
                  <button onClick={() => p.onChannelSettings(c)} aria-label={`Settings for ${c.name}`} className="absolute right-2 top-2 text-[#b5bac1] opacity-0 transition hover:text-[#dbdee1] group-hover:opacity-100"><Settings size={14} /></button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between px-2 text-[#949ba4]">
            <p className="text-[11px] font-bold uppercase tracking-wider">Direct messages</p>
            <button onClick={p.onNewDm} aria-label="New direct message" title="New direct message" className="p-0.5 transition-colors hover:text-[#dbdee1]"><Plus size={14} /></button>
          </div>
          <div className="space-y-0.5">
            {p.dms.map((c) => {
              const active = p.activeChannelId === c.id;
              const n = unread[c.id] ?? 0;
              const peer = c.dmUser;
              return (
                <button key={c.id} onClick={() => p.onSelectChannel(c.id)} aria-current={active} className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-[15px] font-medium transition-colors ${active ? 'bg-[#3f4248] text-white' : n ? 'text-white hover:bg-[#36373d]' : 'text-[#949ba4] hover:bg-[#36373d] hover:text-[#dbdee1]'}`}>
                  <Avatar name={peer?.name ?? '?'} id={peer?.id} size={22} online={!!(peer && online[peer.id])} />
                  <span className="truncate">{peer?.name ?? 'Unknown'}</span>
                  {!active && <UnreadBadge n={n} />}
                </button>
              );
            })}
            {p.dms.length === 0 && <p className="px-2 py-1 text-xs text-[#6d737d]">No conversations yet</p>}
          </div>
        </div>
      </div>

      <div className="flex h-[52px] items-center justify-between bg-[#232428] px-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 p-1">
          <Avatar name={user.name} id={user.id} size={32} online={connected} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-bold text-white">{user.name}</p>
            <p className="truncate text-[11px] text-[#949ba4]">{connected ? 'Online' : 'Connecting…'}</p>
          </div>
        </div>
        <button onClick={p.onLogout} aria-label="Log out" title="Log out" className="rounded p-2 text-[#b5bac1] transition-colors hover:bg-rose-500/10 hover:text-rose-400"><LogOut size={16} /></button>
      </div>
    </aside>
  );
}
