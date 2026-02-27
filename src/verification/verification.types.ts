export interface VerifyResult {
  valid: boolean;
  projectId?: string;
  rateLimitRemaining?: number;
  error?: string;
  retryAfter?: number;
}

export interface CachedKeyData {
  id: string;
  projectId: string;
  revoked: boolean;
}
