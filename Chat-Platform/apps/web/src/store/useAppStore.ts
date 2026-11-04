import { create } from 'zustand';
import type { ChannelDTO, MessageDTO, NotificationDTO, UserDTO } from '@repo/shared-types';
import { TOKEN_KEY } from '../lib/api';
import {
  applyDeleted,
  applyEdited,
  applyHistory,
  applyNew,
  applyOlder,
  applyReaction,
  applyReceipt,
  bumpReplyCount,
  emptyChannel,
  type ChannelMessages,
  type LocalMessage,
} from './messages';

const USER_KEY = 'user';

function loadUser(): UserDTO | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserDTO) : null;
  } catch {
    return null;
  }
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export type RightPanel = 'members' | 'activity';

interface AppState {
  // ── auth ──
  token: string | null;
  user: UserDTO | null;
  setAuth: (token: string, user: UserDTO) => void;
  clearAuth: () => void;

  // ── navigation / ui ──
  activeWorkspaceId: string | null;
  activeChannelId: string | null;
  rightPanel: RightPanel;
  threadParentId: string | null;
  setActiveWorkspace: (id: string | null) => void;
  setActiveChannel: (id: string | null) => void;
  setRightPanel: (p: RightPanel) => void;
  openThread: (messageId: string) => void;
  closeThread: () => void;

  // ── realtime ──
  connected: boolean;
  onlineIds: Record<string, true>;
  channelIndex: Record<string, ChannelDTO>; // every channel we've seen (names, kinds)
  messages: Record<string, ChannelMessages>;
  threads: Record<string, LocalMessage[]>;
  typing: Record<string, Record<string, { name: string; until: number }>>;
  unread: Record<string, number>;
  notifications: NotificationDTO[];
  notificationUnread: number;
  toasts: Toast[];

  setConnected: (c: boolean) => void;
  setOnline: (ids: string[]) => void;
  setPresence: (userId: string, online: boolean) => void;
  indexChannels: (channels: ChannelDTO[]) => void;
  historyLoaded: (channelId: string, messages: MessageDTO[], hasMore: boolean) => void;
  olderLoaded: (channelId: string, messages: MessageDTO[], hasMore: boolean) => void;
  setLoadingMore: (channelId: string, v: boolean) => void;
  messageReceived: (msg: MessageDTO) => void;
  addPending: (msg: LocalMessage) => void;
  dropPending: (channelId: string) => void;
  messageEdited: (channelId: string, id: string, content: string) => void;
  messageDeleted: (channelId: string, id: string) => void;
  reactionChanged: (channelId: string, id: string, emoji: string, userId: string, action: 'add' | 'remove') => void;
  receiptChanged: (channelId: string, id: string, userId: string, status: 'delivered' | 'read') => void;
  threadLoaded: (parentId: string, replies: MessageDTO[]) => void;
  threadReplyReceived: (reply: MessageDTO) => void;
  addPendingReply: (reply: LocalMessage) => void;
  setTyping: (channelId: string, userId: string, name: string, isTyping: boolean) => void;
  clearUnread: (channelId: string) => void;
  setNotifications: (items: NotificationDTO[], unread: number) => void;
  notificationReceived: (n: NotificationDTO) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

const patchChannel = (s: AppState, channelId: string, fn: (c: ChannelMessages) => ChannelMessages) => ({
  messages: { ...s.messages, [channelId]: fn(s.messages[channelId] ?? emptyChannel()) },
});

let toastSeq = 1;

export const useAppStore = create<AppState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: loadUser(),
  setAuth: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },
  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Wipe everything user-specific so a second account on the same browser starts clean.
    set({
      token: null,
      user: null,
      activeWorkspaceId: null,
      activeChannelId: null,
      threadParentId: null,
      connected: false,
      onlineIds: {},
      channelIndex: {},
      messages: {},
      threads: {},
      typing: {},
      unread: {},
      notifications: [],
      notificationUnread: 0,
    });
  },

  activeWorkspaceId: localStorage.getItem('activeWorkspaceId'),
  activeChannelId: null,
  rightPanel: 'members',
  threadParentId: null,
  setActiveWorkspace: (id) => {
    if (id) localStorage.setItem('activeWorkspaceId', id);
    else localStorage.removeItem('activeWorkspaceId');
    set({ activeWorkspaceId: id, activeChannelId: null, threadParentId: null });
  },
  setActiveChannel: (id) =>
    set((s) => ({
      activeChannelId: id,
      threadParentId: null,
      unread: id ? { ...s.unread, [id]: 0 } : s.unread,
    })),
  setRightPanel: (p) => set({ rightPanel: p }),
  openThread: (messageId) => set({ threadParentId: messageId }),
  closeThread: () => set({ threadParentId: null }),

  connected: false,
  onlineIds: {},
  channelIndex: {},
  messages: {},
  threads: {},
  typing: {},
  unread: {},
  notifications: [],
  notificationUnread: 0,
  toasts: [],

  setConnected: (connected) => set({ connected }),
  setOnline: (ids) => set({ onlineIds: Object.fromEntries(ids.map((i) => [i, true as const])) }),
  setPresence: (userId, online) =>
    set((s) => {
      const next = { ...s.onlineIds };
      if (online) next[userId] = true;
      else delete next[userId];
      return { onlineIds: next };
    }),
  indexChannels: (channels) =>
    set((s) => ({ channelIndex: { ...s.channelIndex, ...Object.fromEntries(channels.map((c) => [c.id, c])) } })),

  historyLoaded: (channelId, messages, hasMore) => set((s) => patchChannel(s, channelId, (c) => applyHistory(c, messages, hasMore))),
  olderLoaded: (channelId, messages, hasMore) => set((s) => patchChannel(s, channelId, (c) => applyOlder(c, messages, hasMore))),
  setLoadingMore: (channelId, v) => set((s) => patchChannel(s, channelId, (c) => ({ ...c, loadingMore: v }))),

  messageReceived: (msg) =>
    set((s) => {
      const isMine = msg.user.id === s.user?.id;
      const bump = !isMine && s.activeChannelId !== msg.channelId;
      return {
        ...patchChannel(s, msg.channelId, (c) => applyNew(c, msg)),
        unread: bump ? { ...s.unread, [msg.channelId]: (s.unread[msg.channelId] ?? 0) + 1 } : s.unread,
      };
    }),
  addPending: (msg) => set((s) => patchChannel(s, msg.channelId, (c) => ({ ...c, items: [...c.items, msg] }))),
  dropPending: (channelId) =>
    set((s) => patchChannel(s, channelId, (c) => ({ ...c, items: c.items.filter((m) => !m.pending) }))),
  messageEdited: (channelId, id, content) => set((s) => patchChannel(s, channelId, (c) => applyEdited(c, id, content))),
  messageDeleted: (channelId, id) =>
    set((s) => ({
      ...patchChannel(s, channelId, (c) => applyDeleted(c, id)),
      threadParentId: s.threadParentId === id ? null : s.threadParentId,
      threads: Object.fromEntries(Object.entries(s.threads).map(([p, list]) => [p, list.filter((m) => m.id !== id)])),
    })),
  reactionChanged: (channelId, id, emoji, userId, action) => set((s) => patchChannel(s, channelId, (c) => applyReaction(c, id, emoji, userId, action))),
  receiptChanged: (channelId, id, userId, status) => set((s) => patchChannel(s, channelId, (c) => applyReceipt(c, id, userId, status))),

  threadLoaded: (parentId, replies) => set((s) => ({ threads: { ...s.threads, [parentId]: replies } })),
  threadReplyReceived: (reply) =>
    set((s) => {
      const parentId = reply.parentMessageId;
      if (!parentId) return {};
      const existing = s.threads[parentId];
      let threads = s.threads;
      if (existing) {
        const i = existing.findIndex((m) => m.id === reply.id || (reply.tempId && m.id === reply.tempId));
        const list = i >= 0 ? existing.map((m, idx) => (idx === i ? reply : m)) : [...existing, reply];
        threads = { ...s.threads, [parentId]: list };
      }
      // Only count it once: our own echo replaces an optimistic row that already bumped the counter.
      const wasOptimistic = !!existing?.some((m) => m.id === reply.tempId);
      return {
        threads,
        ...(wasOptimistic ? {} : patchChannel(s, reply.channelId, (c) => bumpReplyCount(c, parentId))),
      };
    }),

  addPendingReply: (reply) =>
    set((s) => {
      const parentId = reply.parentMessageId!;
      return {
        threads: { ...s.threads, [parentId]: [...(s.threads[parentId] ?? []), reply] },
        ...patchChannel(s, reply.channelId, (c) => bumpReplyCount(c, parentId)),
      };
    }),

  setTyping: (channelId, userId, name, isTyping) =>
    set((s) => {
      const forChannel = { ...(s.typing[channelId] ?? {}) };
      if (isTyping) forChannel[userId] = { name, until: Date.now() + 6000 }; // server stops us at 3s; 6s is a safety net
      else delete forChannel[userId];
      return { typing: { ...s.typing, [channelId]: forChannel } };
    }),
  clearUnread: (channelId) => set((s) => ({ unread: { ...s.unread, [channelId]: 0 } })),

  setNotifications: (items, unread) => set({ notifications: items, notificationUnread: unread }),
  notificationReceived: (n) =>
    set((s) => ({
      notifications: [n, ...s.notifications.filter((x) => x.id !== n.id)].slice(0, 50),
      notificationUnread: s.notificationUnread + 1,
    })),

  toast: (text, kind = 'info') => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }].slice(-4) }));
    setTimeout(() => get().dismissToast(id), 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
