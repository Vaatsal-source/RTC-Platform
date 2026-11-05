import type { MessageDTO } from '@repo/shared-types';

// Pure reducers for the per-channel message list. Kept free of React/Zustand so they're unit-testable.

export interface LocalMessage extends MessageDTO {
  pending?: boolean; // optimistic message awaiting the server echo
  failed?: boolean;
}

export interface ChannelMessages {
  items: LocalMessage[]; // oldest → newest, top-level messages only
  hasMore: boolean;
  loaded: boolean;
  loadingMore: boolean;
}

export const emptyChannel = (): ChannelMessages => ({ items: [], hasMore: false, loaded: false, loadingMore: false });

const byId = (list: LocalMessage[], id: string) => list.findIndex((m) => m.id === id);

export function applyHistory(_state: ChannelMessages, messages: MessageDTO[], hasMore: boolean): ChannelMessages {
  return { items: messages, hasMore, loaded: true, loadingMore: false };
}

/** Prepend an older page, skipping anything we already have. */
export function applyOlder(state: ChannelMessages, messages: MessageDTO[], hasMore: boolean): ChannelMessages {
  const have = new Set(state.items.map((m) => m.id));
  return { ...state, items: [...messages.filter((m) => !have.has(m.id)), ...state.items], hasMore, loadingMore: false };
}

/** Server echo replaces the optimistic copy (matched by tempId); otherwise append, ignoring duplicates. */
export function applyNew(state: ChannelMessages, msg: MessageDTO): ChannelMessages {
  if (msg.tempId) {
    const i = state.items.findIndex((m) => m.pending && (m.id === msg.tempId || m.tempId === msg.tempId));
    if (i >= 0) {
      const items = state.items.slice();
      items[i] = { ...msg, pending: false };
      return { ...state, items };
    }
  }
  if (byId(state.items, msg.id) >= 0) return state;
  return { ...state, items: [...state.items, msg] };
}

export function applyEdited(state: ChannelMessages, messageId: string, newContent: string): ChannelMessages {
  return mapOne(state, messageId, (m) => ({ ...m, content: newContent, isEdited: true }));
}

export function applyDeleted(state: ChannelMessages, messageId: string): ChannelMessages {
  const items = state.items.filter((m) => m.id !== messageId);
  return items.length === state.items.length ? state : { ...state, items };
}

export function applyReaction(state: ChannelMessages, messageId: string, emoji: string, userId: string, action: 'add' | 'remove'): ChannelMessages {
  return mapOne(state, messageId, (m) => ({ ...m, reactions: reduceReactions(m.reactions, emoji, userId, action) }));
}

export function reduceReactions(reactions: MessageDTO['reactions'], emoji: string, userId: string, action: 'add' | 'remove'): MessageDTO['reactions'] {
  const list = reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
  const i = list.findIndex((r) => r.emoji === emoji);
  if (action === 'add') {
    if (i < 0) list.push({ emoji, userIds: [userId] });
    else if (!list[i].userIds.includes(userId)) list[i].userIds.push(userId);
  } else if (i >= 0) {
    list[i].userIds = list[i].userIds.filter((u) => u !== userId);
    if (list[i].userIds.length === 0) list.splice(i, 1);
  }
  return list;
}

export function applyReceipt(state: ChannelMessages, messageId: string, userId: string, status: 'delivered' | 'read'): ChannelMessages {
  return mapOne(state, messageId, (m) => ({
    ...m,
    deliveredTo: m.deliveredTo.includes(userId) ? m.deliveredTo : [...m.deliveredTo, userId],
    readBy: status === 'read' && !m.readBy.includes(userId) ? [...m.readBy, userId] : m.readBy,
  }));
}

export function bumpReplyCount(state: ChannelMessages, parentId: string, delta = 1): ChannelMessages {
  return mapOne(state, parentId, (m) => ({ ...m, replyCount: Math.max(0, m.replyCount + delta) }));
}

function mapOne(state: ChannelMessages, id: string, fn: (m: LocalMessage) => LocalMessage): ChannelMessages {
  const i = byId(state.items, id);
  if (i < 0) return state;
  const items = state.items.slice();
  items[i] = fn(items[i]);
  return { ...state, items };
}

/** Receipt state for the sender's own message in a 1:1 / small-group chat. */
export function receiptStatus(m: Pick<MessageDTO, 'deliveredTo' | 'readBy'>): 'sent' | 'delivered' | 'read' {
  if (m.readBy.length > 0) return 'read';
  if (m.deliveredTo.length > 0) return 'delivered';
  return 'sent';
}
