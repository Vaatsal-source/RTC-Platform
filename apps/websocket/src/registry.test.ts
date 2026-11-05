import { describe, expect, it, vi } from 'vitest';
import type { BroadcastEnvelope } from '@repo/shared-types';

vi.mock('@repo/queue', () => ({ publishBroadcast: vi.fn(async () => undefined) }));

import { deliver, dropChannel, registerConnection, removeConnection, resolveLocalTargets, stats, subscribe, unsubscribe } from './registry';
import type { Client } from './types';

const sock = (userId: string, workspaceIds: string[] = []): Client & { sent: string[] } => {
  const sent: string[] = [];
  return { userId, username: userId, socketId: `${userId}-${Math.random()}`, readyState: 1, send: (d: string) => sent.push(d), workspaceIds: new Set(workspaceIds), channels: new Set(), sent } as unknown as Client & { sent: string[] };
};
const env = (target: BroadcastEnvelope['target'], excludeUserId?: string): BroadcastEnvelope => ({ origin: 't', target, frame: '{"type":"X","payload":1}', excludeUserId });

describe('registry', () => {
  it('delivers channel broadcasts only to that channel\'s subscribers', () => {
    const a = sock('a'), b = sock('b'), c = sock('c');
    [a, b, c].forEach(registerConnection);
    subscribe(a, 'room1');
    subscribe(b, 'room1');
    subscribe(c, 'room2');

    deliver(env({ kind: 'channel', channelId: 'room1' }));
    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
    expect(c.sent).toHaveLength(0);
    [a, b, c].forEach(removeConnection);
  });

  it('can exclude the sender', () => {
    const a = sock('a'), b = sock('b');
    [a, b].forEach(registerConnection);
    subscribe(a, 'r');
    subscribe(b, 'r');
    deliver(env({ kind: 'channel', channelId: 'r' }, 'a'));
    expect(a.sent).toHaveLength(0);
    expect(b.sent).toHaveLength(1);
    [a, b].forEach(removeConnection);
  });

  it('delivers to every tab of a user', () => {
    const t1 = sock('u'), t2 = sock('u'), other = sock('v');
    [t1, t2, other].forEach(registerConnection);
    deliver(env({ kind: 'user', userId: 'u' }));
    expect(t1.sent).toHaveLength(1);
    expect(t2.sent).toHaveLength(1);
    expect(other.sent).toHaveLength(0);
    [t1, t2, other].forEach(removeConnection);
  });

  it('scopes workspace broadcasts by membership', () => {
    const inW = sock('a', ['w1']), outW = sock('b', ['w2']);
    [inW, outW].forEach(registerConnection);
    expect(resolveLocalTargets(env({ kind: 'workspaces', workspaceIds: ['w1'] }))).toEqual([inW]);
    [inW, outW].forEach(removeConnection);
  });

  it('skips sockets that are not open', () => {
    const a = sock('a');
    (a as any).readyState = 3;
    registerConnection(a);
    subscribe(a, 'r');
    deliver(env({ kind: 'channel', channelId: 'r' }));
    expect(a.sent).toHaveLength(0);
    removeConnection(a);
  });

  it('cleans every index when a socket disconnects (no leaks)', () => {
    const a = sock('a');
    registerConnection(a);
    subscribe(a, 'r1');
    subscribe(a, 'r2');
    expect(stats()).toMatchObject({ sockets: 1, channels: 2 });
    removeConnection(a);
    expect(stats()).toMatchObject({ sockets: 0, users: 0, channels: 0 });
  });

  it('supports unsubscribe and dropping a whole channel', () => {
    const a = sock('a'), b = sock('b');
    [a, b].forEach(registerConnection);
    subscribe(a, 'r');
    subscribe(b, 'r');
    unsubscribe(a, 'r');
    expect(resolveLocalTargets(env({ kind: 'channel', channelId: 'r' }))).toEqual([b]);
    dropChannel('r');
    expect(resolveLocalTargets(env({ kind: 'channel', channelId: 'r' }))).toEqual([]);
    expect(b.channels.has('r')).toBe(false);
    [a, b].forEach(removeConnection);
  });
});
