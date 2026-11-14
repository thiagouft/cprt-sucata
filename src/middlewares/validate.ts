import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { badRequest } from '../lib/errors.js';

type Source = 'body' | 'params' | 'query';

/** Valida (e substitui) req[source] com um schema Zod. */
export const validate =
  (schema: ZodType, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const msg = result.error.issues.map(i => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message).join('; ');
      return next(badRequest(msg, 'validation_error'));
    }
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
