export interface ProjectStatsResponse {
  totalRequests: number;
  successRate: number;
  topKeys: Array<{ keyId: string; keyType: 'api' | 'service'; requests: number }>;
  requestsByDay: Array<{ date: string; count: number; errors: number }>;
  rateLimitHits: number;
  avgLatencyMs: number;
}

export type StatsRange = '1d' | '7d' | '30d';
