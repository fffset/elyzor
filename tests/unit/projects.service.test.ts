import { ProjectService } from '../../src/projects/projects.service';
import { ProjectRepository } from '../../src/projects/projects.repository';
import { NotFoundError } from '../../src/errors';

jest.mock('../../src/projects/projects.repository');

const mockProject = {
  _id: { toString: () => 'proj1' },
  name: 'my-api',
  userId: { toString: () => 'user1' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Module yuklenince ProjectService kendi repo singleton'ini olusturur.
// jest.mock auto-mock ile sinifi mocklar; instances[0] o singleton'dir.
// jest.clearAllMocks() instances'i temizler, bu yuzden top-level'da yakalariz.
const repo = (ProjectRepository as jest.MockedClass<typeof ProjectRepository>).mock.instances[0] as jest.Mocked<ProjectRepository>;

describe('ProjectService', () => {
  let service: ProjectService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProjectService();
  });

  describe('listProjects', () => {
    it('kullanicinin projelerini listeler', async () => {
      repo.findAllByUser.mockResolvedValue([mockProject] as never);
      const result = await service.listProjects('user1');
      expect(result).toHaveLength(1);
      expect(repo.findAllByUser).toHaveBeenCalledWith('user1');
    });

    it('proje yoksa bos dizi doner', async () => {
      repo.findAllByUser.mockResolvedValue([] as never);
      const result = await service.listProjects('user1');
      expect(result).toEqual([]);
    });
  });

  describe('createProject', () => {
    it('proje olusturor ve doner', async () => {
      repo.create.mockResolvedValue(mockProject as never);
      const result = await service.createProject('user1', { name: 'my-api' });
      expect(result).toBe(mockProject);
    });

    it('name trim edilerek kaydedilir', async () => {
      repo.create.mockResolvedValue(mockProject as never);
      await service.createProject('user1', { name: '  my-api  ' });
      expect(repo.create).toHaveBeenCalledWith({ userId: 'user1', name: 'my-api' });
    });

    it('userId dogru gecilir', async () => {
      repo.create.mockResolvedValue(mockProject as never);
      await service.createProject('user42', { name: 'test' });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user42' }));
    });
  });

  describe('deleteProject', () => {
    it('proje bulunamazsa NotFoundError firlatir', async () => {
      repo.findByIdAndUser.mockResolvedValue(null);
      await expect(service.deleteProject('user1', 'nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('proje bulunursa silinir', async () => {
      repo.findByIdAndUser.mockResolvedValue(mockProject as never);
      repo.deleteByIdAndUser.mockResolvedValue(undefined as never);

      await service.deleteProject('user1', 'proj1');
      expect(repo.deleteByIdAndUser).toHaveBeenCalledWith('proj1', 'user1');
    });

    it('baska kullanicinin projesini silemez', async () => {
      repo.findByIdAndUser.mockResolvedValue(null);
      await expect(service.deleteProject('user2', 'proj1')).rejects.toThrow(NotFoundError);
      expect(repo.deleteByIdAndUser).not.toHaveBeenCalled();
    });
  });

  describe('assertOwnership', () => {
    it('proje kullaniciya aitse projeyi doner', async () => {
      repo.findByIdAndUser.mockResolvedValue(mockProject as never);
      const result = await service.assertOwnership('user1', 'proj1');
      expect(result).toBe(mockProject);
    });

    it('proje bulunamazsa NotFoundError firlatir', async () => {
      repo.findByIdAndUser.mockResolvedValue(null);
      await expect(service.assertOwnership('user1', 'proj1')).rejects.toThrow(NotFoundError);
    });

    it('dogru userId ve projectId ile sorgu yapilir', async () => {
      repo.findByIdAndUser.mockResolvedValue(mockProject as never);
      await service.assertOwnership('user1', 'proj1');
      expect(repo.findByIdAndUser).toHaveBeenCalledWith('proj1', 'user1');
    });
  });
});
