import { describe, expect, it } from 'vitest';
import { extractMentionHandles, mentionHandle, pairKey } from './util';
import { clientMessageSchema } from './ws';

describe('mentions', () => {
  it('normalises names to handles', () => {
    expect(mentionHandle('John Dev')).toBe('johndev');
    expect(mentionHandle('Sarah-Archi_1')).toBe('saraharchi_1');
  });

  it('extracts unique handles', () => {
    expect(extractMentionHandles('hi @JohnDev and @sarah, @johndev again')).toEqual(['johndev', 'sarah']);
  });

  it('ignores emails', () => {
    expect(extractMentionHandles('mail me at a@b.com')).toEqual([]);
  });
});

describe('pairKey', () => {
  it('is symmetric', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
});

describe('clientMessageSchema', () => {
  it('accepts a valid SEND_MESSAGE', () => {
    const r = clientMessageSchema.safeParse({ type: 'SEND_MESSAGE', payload: { channelId: 'c1', content: 'hi' } });
    expect(r.success).toBe(true);
  });

  it('rejects unknown types and bad payloads', () => {
    expect(clientMessageSchema.safeParse({ type: 'NOPE', payload: {} }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'JOIN_CHANNEL', payload: {} }).success).toBe(false);
  });

  it('trims content and rejects blank replies', () => {
    const r = clientMessageSchema.safeParse({
      type: 'SEND_THREAD_REPLY',
      payload: { parentMessageId: 'p', channelId: 'c', content: '   ' },
    });
    expect(r.success).toBe(false);
  });
});
