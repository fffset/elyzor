import { Router, Request, Response, NextFunction } from 'express';
import { StatsService } from './stats.service';
import { authGuard } from '../middleware/authGuard';
import { StatsRange } from './stats.types';

const router = Router({ mergeParams: true });
const statsService = new StatsService();

const VALID_RANGES: StatsRange[] = ['1d', '7d', '30d'];

router.use(authGuard);

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawRange = (req.query.range as string) ?? '7d';
    const range: StatsRange = VALID_RANGES.includes(rawRange as StatsRange)
      ? (rawRange as StatsRange)
      : '7d';

    const stats = await statsService.getProjectStats(req.userId!, req.params.projectId, range);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

export default router;
