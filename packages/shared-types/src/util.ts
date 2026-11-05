// Small pure helpers shared by server and client.

/** "John Dev" → "johndev". Users are mentioned as @johndev. */
export function mentionHandle(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/** Extract unique lower-cased @handles from message text. */
export function extractMentionHandles(content: string): string[] {
  const handles = new Set<string>();
  for (const m of content.matchAll(/(?:^|\s)@([a-zA-Z0-9_]+)/g)) handles.add(m[1].toLowerCase());
  return [...handles];
}

/** Stable key for a 1:1 conversation regardless of who initiates it. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}
