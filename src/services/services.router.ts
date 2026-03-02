import { Router, Request, Response, NextFunction } from 'express';
import { ServicesService } from './services.service';
import { authGuard } from '../middleware/authGuard';
import { validateDto } from '../middleware/validateDto';
import { CreateServiceDto } from './dtos/create-service.dto';

const router = Router({ mergeParams: true });
const servicesService = new ServicesService();

router.use(authGuard);

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const services = await servicesService.listServices(req.userId!, req.params.projectId);
    res.json(services);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  validateDto(CreateServiceDto),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateServiceDto;
      const result = await servicesService.createService(req.userId!, req.params.projectId, dto);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:serviceId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await servicesService.revokeService(req.userId!, req.params.projectId, req.params.serviceId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
