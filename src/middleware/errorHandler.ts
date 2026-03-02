import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { logger } from '../config/logger';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'internal_error' });
}
