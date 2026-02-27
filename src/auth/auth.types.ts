export interface RegisterResponse {
  user: { id: string; email: string };
  token: {
    accessToken: string;
    refreshToken: string;
  }
}

export interface LoginResponse {
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}
