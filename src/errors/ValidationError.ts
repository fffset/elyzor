import { AppError } from './AppError';

export class ValidationError extends AppError {
  constructor(message = 'Geçersiz istek') {
    super(message, 400, 'validation_error');
  }
}
