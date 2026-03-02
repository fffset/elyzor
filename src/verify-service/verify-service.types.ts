export interface VerifyServiceResult {
  valid: boolean;
  projectId?: string;
  service?: { id: string; name: string };
  rateLimitRemaining?: number;
  error?: string;
  retryAfter?: number;
}

export interface CachedServiceData {
  id: string;
  name: string;
  projectId: string;
  revokedAt?: string;
}
