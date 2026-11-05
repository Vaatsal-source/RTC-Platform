import type { Request } from 'express';

/** Express 5 types route params as `string | string[]`; ours are always plain strings. */
export const param = (req: Request, name: string): string => {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
};
