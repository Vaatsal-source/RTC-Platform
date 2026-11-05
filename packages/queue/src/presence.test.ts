import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal in-memory stand-in for the Redis commands presence uses.
const db = vi.hoisted(() => {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const ops = {
    exists: async (k: string) => (kv.has(k) || sets.has(k) ? 1 : 0),
    sadd: (k: string, v: string) => void (sets.get(k) ?? sets.set(k, new Set()).get(k)!).add(v),
    srem: async (k: string, v: string) => void sets.get(k)?.delete(v),
    scard: async (k: string) => sets.get(k)?.size ?? 0,
    del: async (...ks: string[]) => ks.forEach((k) => (kv.delete(k), sets.delete(k))),
    set: (k: string, v: string) => void kv.set(k, v),
    expire: () => undefined,
    mget: async (...ks: string[]) => ks.map((k) => kv.get(k) ?? null),
  };
  const chain = () => {
    const calls: Array<() => void> = [];
    const proxy: any = new Proxy({}, { get: (_t, name: string) => (name === 'exec' ? async () => calls.forEach((c) => c()) : (...args: any[]) => (calls.push(() => (ops as any)[name](...args)), proxy)) });
    return proxy;
  };
  return { kv, sets, redis: { ...ops, multi: chain, pipeline: chain } };
});
vi.mock('./redis.js', () => ({ getRedis: () => db.redis }));

import { addSocket, filterOnline, isOnline, removeSocket } from './presence';

beforeEach(() => {
  db.kv.clear();
  db.sets.clear();
});

describe('presence (multi-tab / multi-instance)', () => {
  it('flips online only on the first socket', async () => {
    expect(await addSocket('u1', 'A:1')).toBe(true);
    expect(await addSocket('u1', 'B:2')).toBe(false); // second tab on another instance
    expect(await isOnline('u1')).toBe(true);
  });

  it('stays online until the LAST socket closes', async () => {
    await addSocket('u1', 'A:1');
    await addSocket('u1', 'B:2');
    expect(await removeSocket('u1', 'A:1')).toBe(false);
    expect(await isOnline('u1')).toBe(true);
    expect(await removeSocket('u1', 'B:2')).toBe(true);
    expect(await isOnline('u1')).toBe(false);
  });

  it('is idempotent for the same socket', async () => {
    await addSocket('u1', 'A:1');
    await addSocket('u1', 'A:1');
    expect(await removeSocket('u1', 'A:1')).toBe(true);
  });

  it('filters a list down to online users', async () => {
    await addSocket('a', 's1');
    await addSocket('c', 's2');
    expect(await filterOnline(['a', 'b', 'c'])).toEqual(['a', 'c']);
    expect(await filterOnline([])).toEqual([]);
  });
});
