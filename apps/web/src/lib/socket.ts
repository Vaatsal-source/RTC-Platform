import type {
  ChannelUpdatedPayload,
  ClientMessage,
  ConnectedPayload,
  MessageDTO,
  MessageEditedPayload,
  MessageHistoryPayload,
  NotificationPayload,
  PresenceSnapshotPayload,
  PresenceUpdatePayload,
  ReactionUpdatePayload,
  ReceiptUpdatePayload,
  ServerFrame,
  TypingUpdatePayload,
} from '@repo/shared-types';
import { WS_URL, ensureFreshToken } from './api';
import { queryClient } from './queryClient';
import { useAppStore } from '../store/useAppStore';

// ═══════════════════════════════════════════════════════════════════════════
// WebSocket connection manager (singleton).
//
// A singleton (not a hook) so React StrictMode's double-mount can never open two
// sockets, and so the connection outlives any one component. It owns:
//   • connect / reconnect with exponential backoff + jitter
//   • routing every server frame into the Zustand store / React Query cache
//   • read-receipt reporting
// ═══════════════════════════════════════════════════════════════════════════

type Send = <T extends ClientMessage['type']>(type: T, payload: Extract<ClientMessage, { type: T }>['payload']) => boolean;

const state = () => useAppStore.getState();

let socket: WebSocket | null = null;
let token: string | null = null;
let attempts = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let intentionallyClosed = false;

export const send: Send = (type, payload) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    state().toast('Not connected — reconnecting…', 'error');
    return false;
  }
  socket.send(JSON.stringify({ type, payload }));
  return true;
};

export function connectSocket(jwt: string): void {
  if (socket && token === jwt && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  disconnectSocket();
  token = jwt;
  intentionallyClosed = false;
  open();
}

export function disconnectSocket(): void {
  intentionallyClosed = true;
  token = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  attempts = 0;
  if (socket) {
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    socket.close(1000, 'client closing');
    socket = null;
  }
  state().setConnected(false);
}

function open(): void {
  if (!token) return;
  const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
  socket = ws;

  ws.onopen = () => {
    attempts = 0;
  };

  ws.onmessage = (ev) => {
    let frame: ServerFrame;
    try {
      frame = JSON.parse(ev.data as string);
    } catch {
      return;
    }
    try {
      handleFrame(frame);
    } catch (err) {
      console.error('[ws] failed to handle frame', frame.type, err);
    }
  };

  ws.onclose = (ev) => {
    if (socket !== ws) return;
    socket = null;
    state().setConnected(false);
    if (intentionallyClosed) return;
    if (ev.code === 4401) {
      // Server rejected our JWT (expired, or revoked by a password reset). Try to renew it once; if that
      // fails the session is really over — reconnecting with the same token would loop forever.
      void ensureFreshToken().then((fresh) => {
        if (intentionallyClosed) return;
        if (fresh) {
          token = fresh;
          state().setTokens(fresh);
          open();
        } else {
          state().clearAuth();
        }
      });
      return;
    }
    // Backoff: 1s, 2s, 4s … capped at 15s, with jitter so a server restart doesn't get a thundering herd.
    const delay = Math.min(15_000, 1000 * 2 ** attempts++) * (0.75 + Math.random() * 0.5);
    retryTimer = setTimeout(open, delay);
  };

  ws.onerror = () => {
    /* onclose follows and handles the retry */
  };
}

// ─── Inbound frames ──────────────────────────────────────────────────────────
function handleFrame(frame: ServerFrame): void {
  const s = state();
  const me = s.user?.id;

  switch (frame.type) {
    case 'CONNECTED': {
      const p = frame.payload as ConnectedPayload;
      s.setConnected(true);
      s.setOnline([...p.onlineUserIds, p.userId]);
      // The shell re-sends JOIN_CHANNEL for the open channel when `connected` flips — covers reconnects.
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      break;
    }
    case 'MESSAGE_HISTORY': {
      const p = frame.payload as MessageHistoryPayload;
      s.historyLoaded(p.channelId, p.messages, p.hasMore);
      reportRead(p.channelId, p.messages);
      break;
    }
    case 'MORE_MESSAGES_LOADED': {
      const p = frame.payload as MessageHistoryPayload;
      s.olderLoaded(p.channelId, p.messages, p.hasMore);
      break;
    }
    case 'NEW_MESSAGE': {
      const m = frame.payload as MessageDTO;
      s.messageReceived(m);
      if (m.user.id !== me) reportReceipt(m);
      break;
    }
    case 'THREAD_REPLY':
      s.threadReplyReceived(frame.payload as MessageDTO);
      break;
    case 'MESSAGE_EDITED': {
      const p = frame.payload as MessageEditedPayload;
      s.messageEdited(p.channelId, p.messageId, p.newContent);
      break;
    }
    case 'MESSAGE_DELETED': {
      const p = frame.payload as { channelId: string; messageId: string };
      s.messageDeleted(p.channelId, p.messageId);
      break;
    }
    case 'REACTION_UPDATE': {
      const p = frame.payload as ReactionUpdatePayload;
      s.reactionChanged(p.channelId, p.messageId, p.emoji, p.userId, p.action);
      break;
    }
    case 'RECEIPT_UPDATE': {
      const p = frame.payload as ReceiptUpdatePayload;
      s.receiptChanged(p.channelId, p.messageId, p.userId, p.status);
      break;
    }
    case 'TYPING_UPDATE': {
      const p = frame.payload as TypingUpdatePayload;
      if (p.userId !== me) s.setTyping(p.channelId, p.userId, p.username, p.isTyping);
      break;
    }
    case 'PRESENCE_SNAPSHOT': {
      const p = frame.payload as PresenceSnapshotPayload;
      s.setOnline(me ? [...p.onlineUserIds, me] : p.onlineUserIds);
      break;
    }
    case 'PRESENCE_UPDATE': {
      const p = frame.payload as PresenceUpdatePayload;
      s.setPresence(p.userId, p.status === 'online');
      void queryClient.invalidateQueries({ queryKey: ['dms'] });
      break;
    }
    case 'NOTIFICATION': {
      const n = frame.payload as NotificationPayload;
      s.notificationReceived(n);
      s.toast(n.message, 'info');
      if (n.kind === 'invite') void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      break;
    }
    case 'CHANNEL_UPDATED': {
      const p = frame.payload as ChannelUpdatedPayload;
      if (p.workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ['channels', p.workspaceId] });
        if (p.change === 'members') {
          void queryClient.invalidateQueries({ queryKey: ['members', p.workspaceId] });
          void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        }
      } else {
        void queryClient.invalidateQueries({ queryKey: ['dms'] });
      }
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
      if (p.change === 'deleted' && p.channelId && s.activeChannelId === p.channelId) {
        s.setActiveChannel(null);
        s.toast('That channel is no longer available', 'info');
      }
      break;
    }
    case 'ERROR': {
      const p = frame.payload as { message: string };
      // Anything we optimistically showed in the open channel didn't make it.
      if (s.activeChannelId) s.dropPending(s.activeChannelId);
      s.toast(p.message, 'error');
      break;
    }
    case 'CHANNEL_JOINED':
      break;
  }
}

// ─── Read receipts (Module 7) ────────────────────────────────────────────────
// Only 1:1 DMs and private channels report receipts. Doing it in big public channels would make
// every message trigger O(members) receipt frames fanned out to O(members) sockets.
const wantsReceipts = (channelId: string) => {
  const kind = state().channelIndex[channelId]?.kind;
  return kind === 'dm' || kind === 'private';
};

function reportReceipt(m: MessageDTO): void {
  if (!wantsReceipts(m.channelId)) return;
  const visible = state().activeChannelId === m.channelId && document.hasFocus();
  send(visible ? 'MARK_READ' : 'MARK_DELIVERED', { channelId: m.channelId, messageId: m.id });
}

/** Mark messages from others as read (capped so opening a huge backlog doesn't flood the socket). */
export function reportRead(channelId: string, messages: MessageDTO[]): void {
  const s = state();
  if (!wantsReceipts(channelId) || s.activeChannelId !== channelId || !document.hasFocus()) return;
  const me = s.user?.id;
  for (const m of messages.filter((x) => x.user.id !== me && !x.readBy.includes(me ?? '')).slice(-30)) {
    send('MARK_READ', { channelId, messageId: m.id });
  }
}

/** Call when the window regains focus or the user switches channel. */
export function reportVisibleRead(): void {
  const { activeChannelId, messages } = state();
  if (activeChannelId) reportRead(activeChannelId, messages[activeChannelId]?.items ?? []);
}
