import { AppError } from './AppError';

export class ForbiddenError extends AppError {
  constructor(message = 'Erişim reddedildi') {
    super(message, 403, 'forbidden');
  }
}
