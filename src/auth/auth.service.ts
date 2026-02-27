import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../users/users.repository';
import { UnauthorizedError, ValidationError } from '../errors';
import { env } from '../config/env';
import { RegisterDto, LoginDto, AuthResponse, RegisterResponse } from './auth.types';

const userRepo = new UserRepository();

export class AuthService {
  async register(dto: RegisterDto): Promise<RegisterResponse> {
    if (!dto.email || !dto.password) {
      throw new ValidationError('Email ve şifre zorunludur');
    }
    if (dto.password.length < 8) {
      throw new ValidationError('Şifre en az 8 karakter olmalıdır');
    }

    const existing = await userRepo.findByEmail(dto.email);
    if (existing) {
      throw new ValidationError('Bu email zaten kullanımda');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await userRepo.create({ email: dto.email, passwordHash });

    return { id: user._id.toString(), email: user.email };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    if (!dto.email || !dto.password) {
      throw new ValidationError('Email ve şifre zorunludur');
    }

    const user = await userRepo.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedError('Geçersiz email veya şifre');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Geçersiz email veya şifre');
    }

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    return { token };
  }
}
