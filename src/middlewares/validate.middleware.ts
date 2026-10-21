import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';

type Schemas = {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
};

// Validates req.body / req.query / req.params against zod schemas.
export const validate =
  (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ['body', 'query', 'params'] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return next(ApiError.badRequest('Validation failed', z.flattenError(result.error)));
      }

      // req.query is a getter in Express 5, so redefine it instead of assigning.
      Object.defineProperty(req, key, { value: result.data, writable: true });
    }
    next();
  };
