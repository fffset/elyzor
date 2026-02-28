declare namespace Express {
  interface Request {
    userId?: string;
    userEmail?: string;
    userType?: 'platform' | 'project';
    projectId?: string;
  }
}
