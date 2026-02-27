import { Router, Request, Response, NextFunction } from 'express';
import { ApiKeyService } from './apikeys.service';
import { authGuard } from '../middleware/authGuard';
import { CreateApiKeyDto } from './apikeys.types';

const router = Router({ mergeParams: true });
const apiKeyService = new ApiKeyService();

router.use(authGuard);

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const keys = await apiKeyService.listKeys(req.userId!, req.params.projectId);
    res.json(keys);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dto: CreateApiKeyDto = { label: req.body.label };
    const result = await apiKeyService.createKey(req.userId!, req.params.projectId, dto);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:keyId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await apiKeyService.revokeKey(req.userId!, req.params.projectId, req.params.keyId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
