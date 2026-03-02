import { ProjectService } from '../projects/projects.service';
import { UsageRepository } from '../usage/usage.repository';
import { ProjectStatsResponse, StatsRange } from './stats.types';

const projectService = new ProjectService();
const usageRepo = new UsageRepository();

const RANGE_DAYS: Record<StatsRange, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
};

export class StatsService {
  async getProjectStats(
    userId: string,
    projectId: string,
    range: StatsRange
  ): Promise<ProjectStatsResponse> {
    await projectService.assertOwnership(userId, projectId);

    const days = RANGE_DAYS[range];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const stats = await usageRepo.getStats(projectId, since);

    const successRate =
      stats.totalRequests > 0
        ? Math.round((stats.successCount / stats.totalRequests) * 1000) / 1000
        : 0;

    return {
      totalRequests: stats.totalRequests,
      successRate,
      topKeys: stats.topKeys,
      requestsByDay: stats.requestsByDay,
      rateLimitHits: stats.rateLimitHits,
      avgLatencyMs: stats.avgLatencyMs,
    };
  }
}
