import { describe, expect, it } from 'vitest';
import type { MessageDTO } from '@repo/shared-types';
import { applyDeleted, applyEdited, applyHistory, applyNew, applyOlder, applyReaction, applyReceipt, emptyChannel, receiptStatus, type LocalMessage } from './messages';

const msg = (id: string, extra: Partial<MessageDTO> = {}): MessageDTO => ({
  id,
  channelId: 'c',
  content: id,
  timestamp: new Date(0).toISOString(),
  user: { id: 'u', name: 'U' },
  parentMessageId: null,
  reactions: [],
  attachments: [],
  isEdited: false,
  isDeleted: false,
  deliveredTo: [],
  readBy: [],
  replyCount: 0,
  ...extra,
});

describe('message reducers', () => {
  it('replaces the optimistic message when the echo arrives (by tempId)', () => {
    const pending: LocalMessage = { ...msg('temp_1'), tempId: 'temp_1', pending: true };
    const s = applyNew({ ...emptyChannel(), items: [pending] }, msg('real', { tempId: 'temp_1' }));
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ id: 'real', pending: false });
  });

  it('ignores duplicate deliveries of the same message', () => {
    const s0 = applyNew(emptyChannel(), msg('a'));
    expect(applyNew(s0, msg('a')).items).toHaveLength(1);
  });

  it('prepends older pages without duplicating', () => {
    const s0 = applyHistory(emptyChannel(), [msg('c'), msg('d')], true);
    const s1 = applyOlder(s0, [msg('a'), msg('b'), msg('c')], false);
    expect(s1.items.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(s1.hasMore).toBe(false);
  });

  it('edits and deletes', () => {
    let s = applyHistory(emptyChannel(), [msg('a'), msg('b')], false);
    s = applyEdited(s, 'a', 'new');
    expect(s.items[0]).toMatchObject({ content: 'new', isEdited: true });
    s = applyDeleted(s, 'a');
    expect(s.items.map((m) => m.id)).toEqual(['b']);
  });

  it('adds and removes reactions, dropping empty ones', () => {
    let s = applyHistory(emptyChannel(), [msg('a')], false);
    s = applyReaction(s, 'a', '👍', 'u1', 'add');
    s = applyReaction(s, 'a', '👍', 'u1', 'add'); // idempotent
    s = applyReaction(s, 'a', '👍', 'u2', 'add');
    expect(s.items[0].reactions).toEqual([{ emoji: '👍', userIds: ['u1', 'u2'] }]);
    s = applyReaction(applyReaction(s, 'a', '👍', 'u1', 'remove'), 'a', '👍', 'u2', 'remove');
    expect(s.items[0].reactions).toEqual([]);
  });

  it('derives Sent → Delivered → Read', () => {
    let s = applyHistory(emptyChannel(), [msg('a')], false);
    expect(receiptStatus(s.items[0])).toBe('sent');
    s = applyReceipt(s, 'a', 'u2', 'delivered');
    expect(receiptStatus(s.items[0])).toBe('delivered');
    s = applyReceipt(s, 'a', 'u2', 'read');
    expect(receiptStatus(s.items[0])).toBe('read');
  });
});
