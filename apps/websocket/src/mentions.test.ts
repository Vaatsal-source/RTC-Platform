import { describe, expect, it } from 'vitest';
import { matchMentions } from './mentions';

const users = [
  { id: '1', name: 'Vaatsalya' },
  { id: '2', name: 'John Dev' },
  { id: '3', name: 'Sarah Archi' },
];

describe('matchMentions', () => {
  it('resolves handles to member ids', () => {
    expect(matchMentions('hey @johndev and @vaatsalya', users)).toEqual(['1', '2']);
  });

  it('never mentions the author', () => {
    expect(matchMentions('@vaatsalya talking to myself', users, '1')).toEqual([]);
  });

  it('ignores unknown handles and plain text', () => {
    expect(matchMentions('@nobody', users)).toEqual([]);
    expect(matchMentions('no mentions here', users)).toEqual([]);
  });
});
