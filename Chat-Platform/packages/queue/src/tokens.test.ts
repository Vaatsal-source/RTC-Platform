import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const ops: Record<string, (...a: any[]) => any> = {
    set: (k: string, v: string) => void kv.set(k, v),
    get: async (k: string) => kv.get(k) ?? null,
    getdel: async (k: string) => { const v = kv.get(k) ?? null; kv.delete(k); return v; },
    del: async (...ks: string[]) => ks.forEach((k) => (kv.delete(k), sets.delete(k))),
    sadd: (k: string, v: string) => void (sets.get(k) ?? sets.set(k, new Set()).get(k)!).add(v),
    srem: async (k: string, v: string) => void sets.get(k)?.delete(v),
    smembers: async (k: string) => [...(sets.get(k) ?? [])],
    expire: () => undefined,
  };
  const chain = () => {
    const calls: Array<() => void> = [];
    const p: any = new Proxy({}, { get: (_t, n: string) => (n === 'exec' ? async () => calls.forEach((c) => c()) : (...a: any[]) => (calls.push(() => ops[n](...a)), p)) });
    return p;
  };
  return { kv, sets, redis: { ...ops, multi: chain } };
});
vi.mock('./redis.js', () => ({ getRedis: () => db.redis }));

import { consumeToken, invalidateSessionsBefore, isSessionRevoked, newOpaqueToken, revokeAllRefreshTokens, storeToken } from './tokens';

beforeEach(() => { db.kv.clear(); db.sets.clear(); });

describe('single-use tokens', () => {
  it('can be consumed exactly once', async () => {
    const t = newOpaqueToken();
    await storeToken('pwreset', t, 'u1', 60);
    expect(await consumeToken('pwreset', t)).toBe('u1');
    expect(await consumeToken('pwreset', t)).toBeNull();
  });

  it('is scoped by kind (a verify token is not a reset token)', async () => {
    const t = newOpaqueToken();
    await storeToken('verify', t, 'u1', 60);
    expect(await consumeToken('pwreset', t)).toBeNull();
    expect(await consumeToken('verify', t)).toBe('u1');
  });

  it('never stores the raw token', async () => {
    const t = newOpaqueToken();
    await storeToken('refresh', t, 'u1', 60);
    expect([...db.kv.keys()].some((k) => k.includes(t))).toBe(false);
  });

  it('rejects junk', async () => {
    expect(await consumeToken('refresh', '')).toBeNull();
    expect(await consumeToken('refresh', 'x'.repeat(500))).toBeNull();
  });
});

describe('revocation', () => {
  it('revokes every refresh token of a user', async () => {
    const a = newOpaqueToken(), b = newOpaqueToken();
    await storeToken('refresh', a, 'u1', 60);
    await storeToken('refresh', b, 'u1', 60);
    await revokeAllRefreshTokens('u1');
    expect(await consumeToken('refresh', a)).toBeNull();
    expect(await consumeToken('refresh', b)).toBeNull();
  });

  it('rejects access tokens issued before a forced logout, accepts newer ones', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await isSessionRevoked('u1', now - 100)).toBe(false); // nothing revoked yet
    await invalidateSessionsBefore('u1');
    expect(await isSessionRevoked('u1', now - 100)).toBe(true);
    expect(await isSessionRevoked('u1', now + 5)).toBe(false);
    expect(await isSessionRevoked('u2', now - 100)).toBe(false); // other users unaffected
  });
});
