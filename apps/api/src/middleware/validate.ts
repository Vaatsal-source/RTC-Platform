import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { badRequest } from '../lib/errors.js';

type Source = 'body' | 'query';

/** Validates + replaces req.body / req.query with the parsed (coerced, trimmed) data. */
export function validate(schema: z.ZodType, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      throw badRequest(
        'Validation failed',
        result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    if (source === 'body') req.body = result.data;
    else Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true }); // Express 5: req.query is a getter
    next();
  };
}
