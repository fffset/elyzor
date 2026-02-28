import { Request, Response } from 'express';
import { AppError } from '../errors';

export function errorHandler(err: Error, _req: Request, res: Response): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'internal_error' });
}
