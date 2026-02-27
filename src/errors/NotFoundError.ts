import { AppError } from './AppError';

export class NotFoundError extends AppError {
  constructor(message = 'Bulunamadı') {
    super(message, 404, 'not_found');
  }
}
