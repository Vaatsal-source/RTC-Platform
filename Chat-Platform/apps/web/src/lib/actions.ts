import type { FileDTO } from '@repo/shared-types';
import { useAppStore } from '../store/useAppStore';
import type { LocalMessage } from '../store/messages';
import { send } from './socket';

// User intents → optimistic UI + WebSocket frame. Components call these instead of touching the socket.

const state = () => useAppStore.getState();
const newTempId = () => `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function optimistic(channelId: string, content: string, extra: Partial<LocalMessage> = {}): LocalMessage {
  const user = state().user!;
  const tempId = newTempId();
  return {
    id: tempId,
    tempId,
    channelId,
    content,
    timestamp: new Date().toISOString(),
    user: { id: user.id, name: user.name },
    parentMessageId: null,
    reactions: [],
    attachments: [],
    isEdited: false,
    isDeleted: false,
    deliveredTo: [],
    readBy: [],
    replyCount: 0,
    pending: true,
    ...extra,
  };
}

export function sendChatMessage(channelId: string, content: string, files: FileDTO[] = []): void {
  const msg = optimistic(channelId, content, { attachments: files });
  state().addPending(msg);
  const ok = send('SEND_MESSAGE', { channelId, content, tempId: msg.tempId, attachmentIds: files.map((f) => f.id) });
  if (!ok) state().dropPending(channelId);
}

export function sendThreadReply(channelId: string, parentMessageId: string, content: string): void {
  const reply = optimistic(channelId, content, { parentMessageId });
  state().addPendingReply(reply);
  send('SEND_THREAD_REPLY', { channelId, parentMessageId, content, tempId: reply.tempId });
}

export const editMessage = (channelId: string, messageId: string, newContent: string) => send('EDIT_MESSAGE', { channelId, messageId, newContent });
export const deleteMessage = (channelId: string, messageId: string) => send('DELETE_MESSAGE', { channelId, messageId });

export function toggleReaction(channelId: string, messageId: string, emoji: string, alreadyReacted: boolean): void {
  send(alreadyReacted ? 'REMOVE_REACTION' : 'ADD_REACTION', { channelId, messageId, emoji });
}

export function loadOlder(channelId: string): void {
  const s = state();
  const ch = s.messages[channelId];
  const oldest = ch?.items.find((m) => !m.pending);
  if (!ch || ch.loadingMore || !ch.hasMore || !oldest) return;
  s.setLoadingMore(channelId, true);
  if (!send('LOAD_MORE_MESSAGES', { channelId, before: oldest.id })) s.setLoadingMore(channelId, false);
}

// Typing: announce at most once per 2s while the user types; the server expires it after 3s of silence.
let lastTypingAt = 0;
export function typing(channelId: string): void {
  const now = Date.now();
  if (now - lastTypingAt < 2000) return;
  lastTypingAt = now;
  send('TYPING_START', { channelId });
}
export function stopTyping(channelId: string): void {
  lastTypingAt = 0;
  send('TYPING_STOP', { channelId });
}
