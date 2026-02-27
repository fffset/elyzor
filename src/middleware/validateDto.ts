import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors';

export function validateDto<T extends object>(DtoClass: new () => T) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const instance = plainToInstance(DtoClass, req.body as Record<string, unknown>);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: false });
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      next(new ValidationError(messages.join(', ')));
      return;
    }
    req.body = instance;
    next();
  };
}
