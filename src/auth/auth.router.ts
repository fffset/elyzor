import { Router, Request, Response, NextFunction } from 'express';
import { AuthService, REFRESH_COOKIE } from './auth.service';
import { authGuard } from '../middleware/authGuard';
import { validateDto } from '../middleware/validateDto';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';

const router = Router();
const authService = new AuthService();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post('/register', validateDto(RegisterDto), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dto: RegisterDto = req.body as RegisterDto;
    const { user, token } = await authService.register(dto);
    res.cookie(REFRESH_COOKIE, token.refreshToken, COOKIE_OPTIONS);
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validateDto(LoginDto), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dto: LoginDto = { email: req.body.email, password: req.body.password };
    const { response, refreshToken } = await authService.login(dto);
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawRefreshToken: string | undefined = req.cookies?.[REFRESH_COOKIE];
    const result = await authService.refresh(rawRefreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const accessToken = req.headers.authorization!.slice(7);
    const rawRefreshToken: string | undefined = req.cookies?.[REFRESH_COOKIE];
    await authService.logout(accessToken, rawRefreshToken);
    res.clearCookie(REFRESH_COOKIE);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/logout-all', authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const accessToken = req.headers.authorization!.slice(7);
    await authService.logoutAll(req.userId!, accessToken);
    res.clearCookie(REFRESH_COOKIE);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
