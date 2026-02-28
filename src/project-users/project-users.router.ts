import { Router, Request, Response, NextFunction } from 'express';
import { ProjectUserService } from './project-users.service';
import { platformGuard } from '../middleware/platformGuard';
import { validateDto } from '../middleware/validateDto';
import { RegisterProjectUserDto } from './dtos/register-project-user.dto';
import { LoginProjectUserDto } from './dtos/login-project-user.dto';
import { REFRESH_COOKIE } from '../auth/auth.service';

const router = Router({ mergeParams: true });
const projectUserService = new ProjectUserService();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post(
  '/register',
  platformGuard,
  validateDto(RegisterProjectUserDto),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto: RegisterProjectUserDto = req.body as RegisterProjectUserDto;
      const { response, refreshToken } = await projectUserService.register(
        req.userId as string,
        req.params.projectId,
        dto
      );
      res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  platformGuard,
  validateDto(LoginProjectUserDto),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto: LoginProjectUserDto = req.body as LoginProjectUserDto;
      const { response, refreshToken } = await projectUserService.login(
        req.userId as string,
        req.params.projectId,
        dto
      );
      res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
