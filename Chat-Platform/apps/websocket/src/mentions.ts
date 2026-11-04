import { extractMentionHandles, mentionHandle } from '@repo/shared-types';

/** Resolve @handles in `content` to user ids, restricted to the given candidates (the channel's members). */
export function matchMentions(content: string, candidates: Array<{ id: string; name: string }>, authorId?: string): string[] {
  if (!content.includes('@')) return [];
  const handles = new Set(extractMentionHandles(content));
  if (handles.size === 0) return [];
  return candidates.filter((c) => c.id !== authorId && handles.has(mentionHandle(c.name))).map((c) => c.id);
}
