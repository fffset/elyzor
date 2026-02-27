import { AppError } from './AppError';

export class UnauthorizedError extends AppError {
  constructor(message = 'Yetkilendirme gerekli') {
    super(message, 401, 'unauthorized');
  }
}
