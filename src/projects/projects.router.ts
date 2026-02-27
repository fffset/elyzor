import { Router, Request, Response, NextFunction } from 'express';
import { ProjectService } from './projects.service';
import { authGuard } from '../middleware/authGuard';
import { validateDto } from '../middleware/validateDto';
import { CreateProjectDto } from './dtos/create-project.dto';

const router = Router();
const projectService = new ProjectService();

router.use(authGuard);

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projects = await projectService.listProjects(req.userId!);
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

router.post('/', validateDto(CreateProjectDto), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dto: CreateProjectDto = req.body as CreateProjectDto;
    const project = await projectService.createProject(req.userId!, dto);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await projectService.deleteProject(req.userId!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
