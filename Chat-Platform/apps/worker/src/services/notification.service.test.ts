import { describe, expect, it } from 'vitest';
import type { MessageCreatedEvent } from '@repo/shared-types';
import { planNotifications } from './notification.service';

const base: MessageCreatedEvent = {
  type: 'message-created',
  messageId: 'm1',
  channelId: 'c1',
  channelName: 'general',
  workspaceId: 'w1',
  isDM: false,
  authorId: 'a',
  authorName: 'Alice',
  content: 'hello',
  mentionedUserIds: [],
  recipientIds: ['b', 'c'],
  ts: 0,
};

describe('planNotifications', () => {
  it('does not notify anyone for a plain channel message', () => {
    expect(planNotifications(base)).toEqual([]);
  });

  it('notifies mentioned users', () => {
    const plan = planNotifications({ ...base, mentionedUserIds: ['b'] });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ userId: 'b', type: 'mention' });
  });

  it('ignores mentions of people who cannot see the channel', () => {
    expect(planNotifications({ ...base, mentionedUserIds: ['zzz'] })).toEqual([]);
  });

  it('notifies the other side of a DM', () => {
    const plan = planNotifications({ ...base, isDM: true, recipientIds: ['b'] });
    expect(plan).toEqual([expect.objectContaining({ userId: 'b', type: 'message' })]);
  });

  it('notifies the parent author on a thread reply, once, mention winning', () => {
    const plan = planNotifications({ ...base, mentionedUserIds: ['b'] }, 'b');
    expect(plan).toHaveLength(1);
    expect(plan[0].type).toBe('mention');
    expect(planNotifications(base, 'c')).toEqual([expect.objectContaining({ userId: 'c', type: 'message' })]);
  });

  it('never notifies the author', () => {
    expect(planNotifications({ ...base, mentionedUserIds: ['a'] }, 'a')).toEqual([]);
  });
});
