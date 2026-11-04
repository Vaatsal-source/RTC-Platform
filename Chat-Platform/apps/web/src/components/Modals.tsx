import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FolderPlus, Hash, Info, LogIn, Lock, MessageSquarePlus, RefreshCw, Settings, Trash2, UserPlus, Users as UsersIcon, X } from 'lucide-react';
import type { ChannelDTO, WorkspaceDTO, WorkspaceMemberDTO } from '@repo/shared-types';
import { Api, errorMessage } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { Avatar, ErrorText, Modal, Spinner, inputCls, labelCls, primaryBtn } from './ui';

// All modals talk to the real API and refresh the relevant React Query caches on success.

function useRefresh() {
  const qc = useQueryClient();
  return (...keys: unknown[][]) => keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
}

// ─── Create workspace ────────────────────────────────────────────────────────
export function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const refresh = useRefresh();
  const setActive = useAppStore((s) => s.setActiveWorkspace);
  const create = useMutation({
    mutationFn: () => Api.createWorkspace({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (ws) => { refresh(['workspaces']); setActive(ws.id); onClose(); },
  });

  return (
    <Modal title="Create a workspace" icon={<FolderPlus size={18} />} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div>
          <label className={labelCls} htmlFor="ws-name">Workspace name</label>
          <input id="ws-name" autoFocus className={`${inputCls} mt-1.5`} placeholder="Acme Engineering" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ws-desc">Description (optional)</label>
          <input id="ws-desc" className={`${inputCls} mt-1.5`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {create.isError && <ErrorText>{errorMessage(create.error)}</ErrorText>}
        <button type="submit" disabled={name.trim().length < 2 || create.isPending} className={`${primaryBtn} w-full`}>{create.isPending ? 'Creating…' : 'Create workspace'}</button>
      </form>
    </Modal>
  );
}

// ─── Join with invite code ───────────────────────────────────────────────────
export function JoinWorkspaceModal({ onClose, initialCode = '' }: { onClose: () => void; initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const refresh = useRefresh();
  const setActive = useAppStore((s) => s.setActiveWorkspace);
  const toast = useAppStore((s) => s.toast);
  const join = useMutation({
    mutationFn: () => Api.joinWorkspace(code.trim()),
    onSuccess: (ws) => { refresh(['workspaces']); setActive(ws.id); toast(`Joined ${ws.name}`, 'success'); onClose(); },
  });

  return (
    <Modal title="Join a workspace" icon={<LogIn size={18} />} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); join.mutate(); }}>
        <div>
          <label className={labelCls} htmlFor="join-code">Invite code or link</label>
          <input
            id="join-code" autoFocus className={`${inputCls} mt-1.5 font-mono`} placeholder="paste invite code" value={code}
            onChange={(e) => setCode(e.target.value.includes('invite=') ? (e.target.value.split('invite=')[1] ?? '') : e.target.value)}
          />
        </div>
        {join.isError && <ErrorText>{errorMessage(join.error)}</ErrorText>}
        <button type="submit" disabled={code.trim().length < 4 || join.isPending} className={`${primaryBtn} w-full`}>{join.isPending ? 'Joining…' : 'Join workspace'}</button>
      </form>
    </Modal>
  );
}

// ─── Invite members ──────────────────────────────────────────────────────────
export function InviteMembersModal({ workspace, onClose }: { workspace: WorkspaceDTO; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const refresh = useRefresh();
  const toast = useAppStore((s) => s.toast);
  const link = `${window.location.origin}/?invite=${workspace.inviteCode ?? ''}`;
  const isAdmin = workspace.myRole === 'admin';

  const invite = useMutation({
    mutationFn: () => Api.inviteByEmail(workspace.id, email.trim()),
    onSuccess: () => { toast(`Added ${email.trim()}`, 'success'); setEmail(''); refresh(['members', workspace.id]); },
  });

  return (
    <Modal title="Invite people" icon={<UserPlus size={18} />} onClose={onClose}>
      {!isAdmin ? <p className="text-sm text-[#949ba4]">Only workspace admins can invite people.</p> : (
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Share invite link</label>
            <div className="mt-1.5 flex gap-2">
              <input readOnly value={link} className="flex-1 rounded bg-[#1e1f22] p-2 font-mono text-xs text-emerald-400 outline-none" onFocus={(e) => e.currentTarget.select()} />
              <button
                onClick={() => { void navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="flex items-center gap-1.5 rounded bg-[#5865F2] px-4 text-xs font-semibold text-white hover:bg-[#4752c4]"
              ><Copy size={12} />{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); invite.mutate(); }}>
            <label className={labelCls} htmlFor="invite-email">Add by email (existing account)</label>
            <div className="mt-1.5 flex gap-2">
              <input id="invite-email" type="email" className={inputCls} placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button type="submit" disabled={!email || invite.isPending} className={primaryBtn}>Add</button>
            </div>
            {invite.isError && <div className="mt-2"><ErrorText>{errorMessage(invite.error)}</ErrorText></div>}
          </form>
        </div>
      )}
    </Modal>
  );
}

// ─── Workspace settings (overview, members & roles) ──────────────────────────
export function WorkspaceSettingsModal({ workspace, members, onClose }: { workspace: WorkspaceDTO; members: WorkspaceMemberDTO[]; onClose: () => void }) {
  const [tab, setTab] = useState<'overview' | 'members'>('overview');
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [confirm, setConfirm] = useState('');
  const refresh = useRefresh();
  const toast = useAppStore((s) => s.toast);
  const me = useAppStore((s) => s.user!.id);
  const setActive = useAppStore((s) => s.setActiveWorkspace);
  const isOwner = workspace.ownerId === me;
  const isAdmin = workspace.myRole === 'admin';

  const save = useMutation({ mutationFn: () => Api.updateWorkspace(workspace.id, { name: name.trim(), description: description.trim() }), onSuccess: () => { refresh(['workspaces']); toast('Saved', 'success'); } });
  const role = useMutation({ mutationFn: (v: { userId: string; role: 'admin' | 'member' }) => Api.setRole(workspace.id, v.userId, v.role), onSuccess: () => refresh(['members', workspace.id]), onError: (e) => toast(errorMessage(e), 'error') });
  const remove = useMutation({ mutationFn: (userId: string) => Api.removeMember(workspace.id, userId), onSuccess: () => refresh(['members', workspace.id]), onError: (e) => toast(errorMessage(e), 'error') });
  const rotate = useMutation({ mutationFn: () => Api.rotateInvite(workspace.id), onSuccess: () => { refresh(['workspaces']); toast('Invite link reset — the old one no longer works', 'success'); } });
  const destroy = useMutation({ mutationFn: () => Api.deleteWorkspace(workspace.id), onSuccess: () => { refresh(['workspaces']); setActive(null); onClose(); } });
  const leave = useMutation({ mutationFn: () => Api.removeMember(workspace.id, me), onSuccess: () => { refresh(['workspaces']); setActive(null); onClose(); }, onError: (e) => toast(errorMessage(e), 'error') });

  const tabBtn = (id: 'overview' | 'members', label: string, icon: React.ReactNode) => (
    <button onClick={() => setTab(id)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-medium transition ${tab === id ? 'bg-[#3f4248] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}`}>{icon}{label}</button>
  );

  return (
    <Modal title="Workspace settings" icon={<Settings size={18} />} onClose={onClose} wide>
      <div className="flex gap-4">
        <div className="w-32 shrink-0 space-y-1">{tabBtn('overview', 'Overview', <Info size={14} />)}{tabBtn('members', 'Members', <UsersIcon size={14} />)}</div>
        <div className="min-h-80 min-w-0 flex-1">
          {tab === 'overview' ? (
            <div className="space-y-4">
              <div>
                <label className={labelCls} htmlFor="s-name">Name</label>
                <input id="s-name" disabled={!isAdmin} className={`${inputCls} mt-1.5`} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="s-desc">Description</label>
                <input id="s-desc" disabled={!isAdmin} className={`${inputCls} mt-1.5`} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
              {isAdmin && <button disabled={name.trim().length < 2 || save.isPending} onClick={() => save.mutate()} className={primaryBtn}>Save changes</button>}

              {isAdmin && (
                <div className="border-t border-white/5 pt-4">
                  <label className={labelCls}>Invite link</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-[#1e1f22] p-2 text-xs text-emerald-400">{`${window.location.origin}/?invite=${workspace.inviteCode}`}</code>
                    <button onClick={() => rotate.mutate()} disabled={rotate.isPending} title="Generate a new link (invalidates the old one)" className="flex items-center gap-1 rounded bg-[#3f4248] px-3 py-2 text-xs text-white hover:bg-[#4a4d55]"><RefreshCw size={12} /> Reset</button>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-rose-400">Danger zone</label>
                {isOwner ? (
                  <>
                    <p className="mb-2 text-[11px] leading-relaxed text-[#949ba4]">Deleting <b className="text-white">{workspace.name}</b> removes every channel, message and file. Type the name to confirm.</p>
                    <input className={`${inputCls} mb-2`} placeholder={workspace.name} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    <button disabled={confirm !== workspace.name || destroy.isPending} onClick={() => destroy.mutate()} className="w-full rounded bg-rose-600 p-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">Delete workspace</button>
                  </>
                ) : (
                  <button onClick={() => leave.mutate()} disabled={leave.isPending} className="w-full rounded bg-rose-600 p-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">Leave workspace</button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className={`${labelCls} mb-2 block`}>Members &amp; roles ({members.length})</label>
              {members.map((m) => {
                const isWsOwner = m.userId === workspace.ownerId;
                return (
                  <div key={m.userId} className="group flex items-center justify-between gap-2 rounded bg-[#2b2d31] p-2 hover:bg-[#35373c]">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={m.name} id={m.userId} size={28} online={m.online} />
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{m.name}{m.userId === me && <span className="ml-1 text-[10px] text-gray-500">(you)</span>}</p><p className="truncate text-[11px] text-[#949ba4]">{m.email}</p></div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isWsOwner ? <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">Owner</span> : (
                        <select
                          aria-label={`Role for ${m.name}`} value={m.role} disabled={!isAdmin || role.isPending}
                          onChange={(e) => role.mutate({ userId: m.userId, role: e.target.value as 'admin' | 'member' })}
                          className="cursor-pointer rounded bg-[#1e1f22] p-1 text-[11px] text-slate-200 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        ><option value="member">Member</option><option value="admin">Admin</option></select>
                      )}
                      {isAdmin && !isWsOwner && m.userId !== me && (
                        <button aria-label={`Remove ${m.name}`} title="Remove from workspace" onClick={() => remove.mutate(m.userId)} className="rounded p-1 text-rose-400 opacity-0 transition-all hover:bg-rose-500/10 group-hover:opacity-100"><X size={14} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Create channel ──────────────────────────────────────────────────────────
export function CreateChannelModal({ workspaceId, members, onClose }: { workspaceId: string; members: WorkspaceMemberDTO[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const me = useAppStore((s) => s.user!.id);
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);
  const refresh = useRefresh();
  const create = useMutation({
    mutationFn: () => Api.createChannel(workspaceId, { name: name.trim(), isPrivate, memberIds: isPrivate ? picked : [] }),
    onSuccess: (ch) => { refresh(['channels', workspaceId]); setActiveChannel(ch.id); onClose(); },
  });

  return (
    <Modal title="Create channel" icon={<Hash size={18} />} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div>
          <label className={labelCls} htmlFor="ch-name">Channel name</label>
          <div className="relative mt-1.5">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#949ba4]">{isPrivate ? <Lock size={14} /> : <Hash size={14} />}</span>
            <input id="ch-name" autoFocus className={`${inputCls} pl-8`} placeholder="new-channel" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-black/20 bg-[#1e1f22] p-3">
          <div>
            <div className="flex items-center gap-1.5"><Lock size={14} className={isPrivate ? 'text-emerald-400' : 'text-[#949ba4]'} /><span className="text-sm font-semibold text-white">Private channel</span></div>
            <span className="mt-0.5 block text-[11px] text-[#949ba4]">Only invited members can see and join.</span>
          </div>
          <button type="button" role="switch" aria-checked={isPrivate} aria-label="Private channel" onClick={() => setIsPrivate((v) => !v)} className={`relative h-5 w-10 shrink-0 rounded-full transition-all ${isPrivate ? 'bg-emerald-500' : 'bg-[#4e5058]'}`}>
            <span className={`absolute left-1 top-1 h-3 w-3 rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {isPrivate && (
          <div>
            <label className={labelCls}>Add members</label>
            <div className="custom-scrollbar mt-1.5 max-h-40 space-y-1 overflow-y-auto">
              {members.filter((m) => m.userId !== me).map((m) => (
                <label key={m.userId} className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-[#35373c]">
                  <input type="checkbox" checked={picked.includes(m.userId)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.userId] : p.filter((x) => x !== m.userId)))} />
                  <Avatar name={m.name} id={m.userId} size={22} /><span className="text-sm text-[#dbdee1]">{m.name}</span>
                </label>
              ))}
              {members.length <= 1 && <p className="text-xs text-gray-500">Invite people to the workspace first.</p>}
            </div>
          </div>
        )}

        {create.isError && <ErrorText>{errorMessage(create.error)}</ErrorText>}
        <button type="submit" disabled={name.trim().length < 2 || create.isPending} className={`${primaryBtn} w-full`}>{create.isPending ? 'Creating…' : 'Create channel'}</button>
      </form>
    </Modal>
  );
}

// ─── Channel settings (rename / archive / delete / private members) ──────────
export function ChannelSettingsModal({ channel, canManage, members, onClose }: { channel: ChannelDTO; canManage: boolean; members: WorkspaceMemberDTO[]; onClose: () => void }) {
  const [name, setName] = useState(channel.name);
  const [confirm, setConfirm] = useState('');
  const refresh = useRefresh();
  const toast = useAppStore((s) => s.toast);
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);
  const wid = channel.workspaceId!;
  const isPrivate = channel.kind === 'private';

  const chMembers = useQuery({ queryKey: ['channel-members', channel.id], queryFn: () => Api.channelMembers(channel.id), enabled: isPrivate });
  const rename = useMutation({ mutationFn: () => Api.renameChannel(channel.id, name.trim()), onSuccess: () => { refresh(['channels', wid]); toast('Renamed', 'success'); } });
  const archive = useMutation({ mutationFn: () => Api.setArchived(channel.id, !channel.isArchived), onSuccess: () => { refresh(['channels', wid]); onClose(); } });
  const destroy = useMutation({ mutationFn: () => Api.deleteChannel(channel.id), onSuccess: () => { refresh(['channels', wid]); setActiveChannel(null); onClose(); } });
  const addMember = useMutation({ mutationFn: (userId: string) => Api.addChannelMember(channel.id, userId), onSuccess: () => refresh(['channel-members', channel.id], ['channels', wid]), onError: (e) => toast(errorMessage(e), 'error') });
  const removeMember = useMutation({ mutationFn: (userId: string) => Api.removeChannelMember(channel.id, userId), onSuccess: () => refresh(['channel-members', channel.id], ['channels', wid]), onError: (e) => toast(errorMessage(e), 'error') });
  const inChannel = new Set((chMembers.data ?? []).map((m) => m.userId));

  return (
    <Modal title="Channel settings" icon={<Settings size={18} />} onClose={onClose}>
      <div className="space-y-6">
        {canManage && (
          <div>
            <label className={labelCls} htmlFor="rename">Name</label>
            <div className="mt-1.5 flex gap-2">
              <input id="rename" className={inputCls} value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
              <button onClick={() => rename.mutate()} disabled={name.trim().length < 2 || name === channel.name || rename.isPending} className={primaryBtn}>Save</button>
            </div>
            {rename.isError && <div className="mt-2"><ErrorText>{errorMessage(rename.error)}</ErrorText></div>}
          </div>
        )}

        {isPrivate && (
          <div>
            <label className={`${labelCls} mb-2 block`}>Members</label>
            {chMembers.isLoading ? <Spinner /> : (
              <div className="custom-scrollbar max-h-44 space-y-1 overflow-y-auto">
                {members.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between rounded p-1.5 hover:bg-[#35373c]">
                    <span className="flex items-center gap-2 text-sm text-[#dbdee1]"><Avatar name={m.name} id={m.userId} size={22} />{m.name}</span>
                    {inChannel.has(m.userId)
                      ? <button onClick={() => removeMember.mutate(m.userId)} className="text-[11px] text-rose-400 hover:underline">Remove</button>
                      : <button onClick={() => addMember.mutate(m.userId)} className="text-[11px] text-[#00a8fc] hover:underline">Add</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {canManage && (
          <>
            <button onClick={() => archive.mutate()} disabled={archive.isPending} className="w-full rounded border border-black/10 bg-[#2b2d31] p-3 text-left transition hover:bg-[#35373c]">
              <span className="block text-sm font-medium text-white">{channel.isArchived ? 'Unarchive channel' : 'Archive channel'}</span>
              <span className="text-[11px] text-[#949ba4]">{channel.isArchived ? 'Allow new messages again.' : 'Make this channel read-only. History is kept.'}</span>
            </button>
            {channel.name !== 'general' && (
              <div className="border-t border-white/5 pt-4">
                <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-rose-400">Danger zone</label>
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                  <p className="mb-3 text-[11px] leading-relaxed text-[#949ba4]">To delete <b className="text-white">{channel.name}</b> and all its messages, type the channel name.</p>
                  <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={channel.name} className={`${inputCls} mb-3`} />
                  <button disabled={confirm !== channel.name || destroy.isPending} onClick={() => destroy.mutate()} className="flex w-full items-center justify-center gap-1.5 rounded bg-rose-600 p-2 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 size={12} />Delete channel</button>
                </div>
              </div>
            )}
          </>
        )}
        {!canManage && !isPrivate && <p className="text-sm text-[#949ba4]">Only workspace admins or the channel's creator can change its settings.</p>}
      </div>
    </Modal>
  );
}

// ─── New direct message ──────────────────────────────────────────────────────
export function NewDmModal({ members, onClose }: { members: WorkspaceMemberDTO[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const me = useAppStore((s) => s.user!.id);
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);
  const refresh = useRefresh();
  const open = useMutation({
    mutationFn: (userId: string) => Api.openDm(userId),
    onSuccess: (ch) => { refresh(['dms']); setActiveChannel(ch.id); onClose(); },
  });
  const list = members.filter((m) => m.userId !== me && m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal title="New direct message" icon={<MessageSquarePlus size={18} />} onClose={onClose}>
      <input autoFocus className={inputCls} placeholder="Find a teammate…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a teammate" />
      <div className="custom-scrollbar mt-3 max-h-64 space-y-1 overflow-y-auto">
        {list.map((m) => (
          <button key={m.userId} disabled={open.isPending} onClick={() => open.mutate(m.userId)} className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-[#35373c]">
            <Avatar name={m.name} id={m.userId} size={28} online={m.online} /><span className="text-sm text-[#dbdee1]">{m.name}</span><span className="ml-auto text-[11px] text-[#949ba4]">{m.email}</span>
          </button>
        ))}
        {list.length === 0 && <p className="p-3 text-center text-xs text-gray-500">No one found</p>}
      </div>
      {open.isError && <div className="mt-2"><ErrorText>{errorMessage(open.error)}</ErrorText></div>}
    </Modal>
  );
}
