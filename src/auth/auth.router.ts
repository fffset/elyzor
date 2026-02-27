import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './auth.types';

const router = Router();
const authService = new AuthService();

router.post('/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dto: RegisterDto = { email: req.body.email, password: req.body.password };
    const result = await authService.register(dto);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dto: LoginDto = { email: req.body.email, password: req.body.password };
    const result = await authService.login(dto);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
