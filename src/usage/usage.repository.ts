import { Types } from 'mongoose';
import { UsageModel } from './usage.model';
import { IUsage, UsageLogDto } from './usage.types';

export interface DayBucket {
  date: string;
  count: number;
  errors: number;
}

export interface TopKey {
  keyId: string;
  requests: number;
}

export interface StatsAggregate {
  totalRequests: number;
  successCount: number;
  rateLimitHits: number;
  avgLatencyMs: number;
  requestsByDay: DayBucket[];
  topKeys: TopKey[];
}

export class UsageRepository {
  async create(dto: UsageLogDto): Promise<IUsage> {
    return UsageModel.create(dto);
  }

  async getStats(projectId: string, since: Date): Promise<StatsAggregate> {
    const projectOid = new Types.ObjectId(projectId);

    const [summary, byDay, topApiKeys, topServiceKeys] = await Promise.all([
      // toplam, başarı sayısı, rate limit ve ortalama gecikme
      UsageModel.aggregate([
        { $match: { projectId: projectOid, timestamp: { $gte: since } } },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            successCount: { $sum: { $cond: [{ $eq: ['$result', 'success'] }, 1, 0] } },
            rateLimitHits: { $sum: { $cond: [{ $eq: ['$result', 'rate_limited'] }, 1, 0] } },
            avgLatencyMs: { $avg: '$latencyMs' },
          },
        },
      ]),

      // günlük dağılım
      UsageModel.aggregate([
        { $match: { projectId: projectOid, timestamp: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 },
            errors: {
              $sum: {
                $cond: [
                  { $in: ['$result', ['invalid_key', 'revoked', 'rate_limited', 'error']] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // en çok kullanan top 5 API key
      UsageModel.aggregate([
        {
          $match: {
            projectId: projectOid,
            timestamp: { $gte: since },
            apiKeyId: { $exists: true, $ne: null },
          },
        },
        { $group: { _id: '$apiKeyId', requests: { $sum: 1 } } },
        { $sort: { requests: -1 } },
        { $limit: 5 },
      ]),

      // en çok kullanan top 5 service key
      UsageModel.aggregate([
        {
          $match: {
            projectId: projectOid,
            timestamp: { $gte: since },
            serviceId: { $exists: true, $ne: null },
          },
        },
        { $group: { _id: '$serviceId', requests: { $sum: 1 } } },
        { $sort: { requests: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const s = summary[0] as
      | { totalRequests: number; successCount: number; rateLimitHits: number; avgLatencyMs: number }
      | undefined;

    // apiKeyId ve serviceId sonuçlarını birleştir, tekrar sırala, top 5 al
    const allKeys = [
      ...(topApiKeys as Array<{ _id: Types.ObjectId; requests: number }>).map((k) => ({
        keyId: k._id.toString(),
        requests: k.requests,
      })),
      ...(topServiceKeys as Array<{ _id: Types.ObjectId; requests: number }>).map((k) => ({
        keyId: k._id.toString(),
        requests: k.requests,
      })),
    ];
    allKeys.sort((a, b) => b.requests - a.requests);

    return {
      totalRequests: s?.totalRequests ?? 0,
      successCount: s?.successCount ?? 0,
      rateLimitHits: s?.rateLimitHits ?? 0,
      avgLatencyMs: Math.round((s?.avgLatencyMs ?? 0) * 10) / 10,
      requestsByDay: (byDay as Array<{ _id: string; count: number; errors: number }>).map((b) => ({
        date: b._id,
        count: b.count,
        errors: b.errors,
      })),
      topKeys: allKeys.slice(0, 5),
    };
  }
}
