import { describe, expect, it, vi } from 'vitest';

// The dispatcher validates/limits before any handler (and therefore any DB/Redis) is touched.
vi.mock('@repo/queue', () => ({ publishBroadcast: vi.fn(), publishEvent: vi.fn(), getChannelMembers: vi.fn(), enqueueAudit: vi.fn() }));
vi.mock('@repo/database', () => ({}));

import { handleRawMessage } from './index';
import type { Client } from '../types';

function sock() {
  const frames: Array<{ type: string; payload: any }> = [];
  const ws = { readyState: 1, userId: 'u', username: 'U', channels: new Set<string>(), tokens: 40, tokensRefilledAt: Date.now(), send: (d: string) => frames.push(JSON.parse(d)) } as unknown as Client;
  return { ws, frames };
}

describe('handleRawMessage', () => {
  it('rejects non-JSON', async () => {
    const { ws, frames } = sock();
    await handleRawMessage(ws, 'not json');
    expect(frames[0]).toMatchObject({ type: 'ERROR', payload: { message: 'Invalid JSON' } });
  });

  it('rejects unknown types', async () => {
    const { ws, frames } = sock();
    await handleRawMessage(ws, JSON.stringify({ type: 'HACK', payload: {} }));
    expect(frames[0].payload.code).toBe('INVALID_MESSAGE');
  });

  it('names the type when the payload is wrong', async () => {
    const { ws, frames } = sock();
    await handleRawMessage(ws, JSON.stringify({ type: 'SEND_MESSAGE', payload: { content: 5 } }));
    expect(frames[0].payload.message).toContain('SEND_MESSAGE');
  });

  it('rate-limits a flooding client', async () => {
    const { ws, frames } = sock();
    ws.tokens = 3;
    for (let i = 0; i < 10; i++) await handleRawMessage(ws, 'x');
    expect(frames.filter((f) => f.payload.code === 'RATE_LIMITED').length).toBeGreaterThan(0);
  });
});
