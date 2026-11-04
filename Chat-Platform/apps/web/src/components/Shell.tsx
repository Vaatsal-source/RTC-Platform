import { useCallback, useEffect, useMemo, useState } from 'react';
import { Hash, Plus, Compass } from 'lucide-react';
import type { ChannelDTO, NotificationDTO, UserDTO } from '@repo/shared-types';
import { Api } from '../lib/api';
import { useChannels, useDms, useMembers, useNotificationsSync, useWorkspaces } from '../lib/queries';
import { disconnectSocket, reportVisibleRead, send } from '../lib/socket';
import { queryClient } from '../lib/queryClient';
import { useAppStore } from '../store/useAppStore';
import { ChannelSettingsModal, CreateChannelModal, CreateWorkspaceModal, InviteMembersModal, JoinWorkspaceModal, NewDmModal, WorkspaceSettingsModal } from './Modals';
import { WorkspaceRail } from './shell/WorkspaceRail';
import { Sidebar } from './shell/Sidebar';
import { ChatView } from './shell/ChatView';
import { RightPanel } from './shell/RightPanel';
import { SearchModal } from './shell/SearchModal';
import { NotificationsMenu } from './shell/NotificationsMenu';
import { ThreadPanel } from './chat/ThreadPanel';
import { Spinner } from './ui';

type ModalState =
  | { kind: 'createWorkspace' }
  | { kind: 'join'; code?: string }
  | { kind: 'invite' }
  | { kind: 'workspaceSettings' }
  | { kind: 'createChannel' }
  | { kind: 'channelSettings'; channel: ChannelDTO }
  | { kind: 'newDm' }
  | { kind: 'search' }
  | null;

export default function Shell() {
  const user = useAppStore((s) => s.user)!;
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const threadParentId = useAppStore((s) => s.threadParentId);
  const connected = useAppStore((s) => s.connected);
  const channelIndex = useAppStore((s) => s.channelIndex);
  const { setActiveWorkspace, setActiveChannel, openThread, clearAuth } = useAppStore.getState();
  const [modal, setModal] = useState<ModalState>(() => {
    const code = new URLSearchParams(window.location.search).get('invite');
    return code ? { kind: 'join', code } : null; // /?invite=CODE → offer to join
  });

  const workspacesQ = useWorkspaces();
  const workspaces = useMemo(() => workspacesQ.data ?? [], [workspacesQ.data]);
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const channelsQ = useChannels(workspace?.id ?? null);
  const channels = useMemo(() => channelsQ.data ?? [], [channelsQ.data]);
  const dmsQ = useDms();
  const dms = useMemo(() => dmsQ.data ?? [], [dmsQ.data]);
  const membersQ = useMembers(workspace?.id ?? null);
  const members = useMemo(() => membersQ.data ?? [], [membersQ.data]);
  useNotificationsSync();

  // Pick a valid workspace (stored one may be gone after leaving/deleting).
  useEffect(() => {
    if (!workspacesQ.isSuccess) return;
    if (activeWorkspaceId && workspaces.some((w) => w.id === activeWorkspaceId)) return;
    setActiveWorkspace(workspaces[0]?.id ?? null);
  }, [workspacesQ.isSuccess, workspaces, activeWorkspaceId, setActiveWorkspace]);

  // Default to #general (or the first channel) once channels load.
  useEffect(() => {
    if (activeChannelId || !channelsQ.isSuccess || channels.length === 0) return;
    setActiveChannel((channels.find((c) => c.name === 'general') ?? channels[0]).id);
  }, [activeChannelId, channelsQ.isSuccess, channels, setActiveChannel]);

  const activeChannel: ChannelDTO | null = useMemo(() => {
    if (!activeChannelId) return null;
    return channels.find((c) => c.id === activeChannelId) ?? dms.find((c) => c.id === activeChannelId) ?? channelIndex[activeChannelId] ?? null;
  }, [activeChannelId, channels, dms, channelIndex]);

  // (Re)open the viewed channel whenever it changes or the socket (re)connects → fresh history.
  useEffect(() => {
    if (!activeChannelId || !connected) return;
    useAppStore.getState().clearUnread(activeChannelId);
    send('JOIN_CHANNEL', { channelId: activeChannelId });
  }, [activeChannelId, connected]);

  // Switching back to the tab marks what you can now see as read.
  useEffect(() => {
    window.addEventListener('focus', reportVisibleRead);
    return () => window.removeEventListener('focus', reportVisibleRead);
  }, []);

  // Drop ?invite= from the address bar once it's been read.
  useEffect(() => {
    if (window.location.search.includes('invite=')) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const goToChannel = useCallback((id: string) => {
    const ch = useAppStore.getState().channelIndex[id];
    if (ch?.workspaceId && ch.workspaceId !== useAppStore.getState().activeWorkspaceId) setActiveWorkspace(ch.workspaceId);
    setActiveChannel(id);
  }, [setActiveChannel, setActiveWorkspace]);

  const openNotification = (n: NotificationDTO) => {
    if (n.workspaceId && n.workspaceId !== activeWorkspaceId) setActiveWorkspace(n.workspaceId);
    if (n.channelId) setActiveChannel(n.channelId);
  };

  const messageUser = async (u: UserDTO) => {
    try {
      const ch = await Api.openDm(u.id);
      void queryClient.invalidateQueries({ queryKey: ['dms'] });
      setActiveChannel(ch.id);
    } catch {
      useAppStore.getState().toast("Can't message that user", 'error');
    }
  };

  const logout = async () => {
    await Api.logout();
    disconnectSocket();
    queryClient.clear();
    clearAuth();
  };

  const isAdmin = workspace?.myRole === 'admin';
  const canManageChannel = (c: ChannelDTO) => isAdmin || c.createdBy === user.id;
  const closeModal = () => setModal(null);

  if (workspacesQ.isLoading) return <div className="flex h-screen items-center justify-center bg-[#313338]"><Spinner label="Loading your workspaces…" /></div>;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#313338] text-gray-200 antialiased">
      <WorkspaceRail
        workspaces={workspaces}
        activeId={workspace?.id ?? null}
        onSelect={setActiveWorkspace}
        onCreate={() => setModal({ kind: 'createWorkspace' })}
        onJoin={() => setModal({ kind: 'join' })}
      />

      {workspace ? (
        <Sidebar
          workspace={workspace}
          channels={channels}
          dms={dms}
          activeChannelId={activeChannelId}
          onSelectChannel={setActiveChannel}
          onCreateChannel={() => setModal({ kind: 'createChannel' })}
          onNewDm={() => setModal({ kind: 'newDm' })}
          onInvite={() => setModal({ kind: 'invite' })}
          onWorkspaceSettings={() => setModal({ kind: 'workspaceSettings' })}
          onChannelSettings={(channel) => setModal({ kind: 'channelSettings', channel })}
          onLogout={logout}
        />
      ) : (
        <div className="flex w-60 shrink-0 flex-col bg-[#2b2d31]" />
      )}

      {activeChannel ? (
        <ChatView
          key={activeChannel.id}
          channel={activeChannel}
          members={members}
          canModerate={isAdmin}
          onOpenThread={openThread}
          onSearch={() => setModal({ kind: 'search' })}
          notifications={<NotificationsMenu onOpen={openNotification} />}
        />
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#313338] p-8 text-center">
          {workspace ? (
            <>
              <Hash size={48} className="text-[#4e5058]" />
              <p className="text-sm text-[#949ba4]">Pick a channel to start chatting.</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-white">Welcome to SyncGrid, {user.name.split(' ')[0]}</h2>
              <p className="max-w-sm text-sm text-[#949ba4]">Create a workspace for your team, or join one with an invite link.</p>
              <div className="flex gap-3">
                <button onClick={() => setModal({ kind: 'createWorkspace' })} className="flex items-center gap-2 rounded bg-[#5865F2] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4752c4]"><Plus size={16} /> Create workspace</button>
                <button onClick={() => setModal({ kind: 'join' })} className="flex items-center gap-2 rounded bg-[#3f4248] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4a4d55]"><Compass size={16} /> Join with code</button>
              </div>
            </>
          )}
        </main>
      )}

      {activeChannel && threadParentId ? (
        <ThreadPanel channelId={activeChannel.id} parentId={threadParentId} members={members} readOnly={activeChannel.isArchived} canModerate={isAdmin} />
      ) : (
        workspace && activeChannel?.kind !== 'dm' && <RightPanel workspaceId={workspace.id} members={members} />
      )}

      {modal?.kind === 'createWorkspace' && <CreateWorkspaceModal onClose={closeModal} />}
      {modal?.kind === 'join' && <JoinWorkspaceModal initialCode={modal.code} onClose={closeModal} />}
      {modal?.kind === 'invite' && workspace && <InviteMembersModal workspace={workspace} onClose={closeModal} />}
      {modal?.kind === 'workspaceSettings' && workspace && <WorkspaceSettingsModal workspace={workspace} members={members} onClose={closeModal} />}
      {modal?.kind === 'createChannel' && workspace && <CreateChannelModal workspaceId={workspace.id} members={members} onClose={closeModal} />}
      {modal?.kind === 'channelSettings' && <ChannelSettingsModal channel={modal.channel} canManage={canManageChannel(modal.channel)} members={members} onClose={closeModal} />}
      {modal?.kind === 'newDm' && <NewDmModal members={members} onClose={closeModal} />}
      {modal?.kind === 'search' && (
        <SearchModal workspaceId={workspace?.id ?? null} onClose={closeModal} onOpenChannel={(c) => goToChannel(c.id)} onOpenChannelId={goToChannel} onMessageUser={(u) => void messageUser(u)} />
      )}
    </div>
  );
}
