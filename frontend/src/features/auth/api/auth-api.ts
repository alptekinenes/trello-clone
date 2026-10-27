import type { AuthResponse, LoginRequest, RegisterRequest } from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** Auth endpoints use the refresh cookie, never the access token. */
const noAuth = { skipAuth: true } as const;

export const authApi = {
  register: (body: RegisterRequest) =>
    apiRequest<AuthResponse>('/auth/register', post(body), noAuth),
  login: (body: LoginRequest) => apiRequest<AuthResponse>('/auth/login', post(body), noAuth),
  refresh: () => apiRequest<AuthResponse>('/auth/refresh', post(), noAuth),
  logout: () => apiRequest<void>('/auth/logout', post(), noAuth),
};
