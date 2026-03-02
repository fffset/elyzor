import { Router, Request, Response, NextFunction } from 'express';
import { VerifyServiceService } from './verify-service.service';

const router = Router();
const verifyServiceService = new VerifyServiceService();

const statusMap: Record<string, number> = {
  invalid_key: 401,
  service_revoked: 403,
  rate_limit_exceeded: 429,
};

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    const result = await verifyServiceService.verify(req.headers.authorization, ip);

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
