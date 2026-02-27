import { Router, Request, Response, NextFunction } from 'express';
import { VerificationService } from './verification.service';

const router = Router();
const verificationService = new VerificationService();

const statusMap: Record<string, number> = {
  invalid_key: 401,
  key_revoked: 403,
  rate_limit_exceeded: 429,
};

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    const result = await verificationService.verify(req.headers.authorization, ip);

    if (!result.valid) {
      const status = result.error ? (statusMap[result.error] ?? 401) : 401;
      res.status(status).json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
