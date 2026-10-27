import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRequest } from '../../shared/lib/http';
import { apiError, testUser } from '../../test/fixtures';
import { server } from '../../test/msw-server';
import { bootstrapSession, installAuth, refreshSession } from './session';
import { useAuthStore } from './store/auth-store';

function refreshReturns(response: () => Response) {
  let calls = 0;
  server.use(
    http.post('*/api/v1/auth/refresh', () => {
      calls += 1;
      return response();
    }),
  );
  return { calls: () => calls };
}

const okRefresh = () => HttpResponse.json({ accessToken: 'fresh-token', user: testUser });

describe('refreshSession', () => {
  it('stores the new session and returns the access token', async () => {
    refreshReturns(okRefresh);

    await expect(refreshSession()).resolves.toBe('fresh-token');
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'fresh-token',
      user: testUser,
    });
  });

  it('shares one request between parallel callers', async () => {
    const refresh = refreshReturns(okRefresh);

    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(results).toEqual(['fresh-token', 'fresh-token', 'fresh-token']);
    expect(refresh.calls()).toBe(1);
  });

  it('signs out when the refresh token is rejected', async () => {
    useAuthStore.getState().setSession({ accessToken: 'old', user: testUser });
    refreshReturns(() => apiError(401, 'INVALID_REFRESH'));

    await expect(refreshSession()).resolves.toBeNull();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('keeps an active session on a server error', async () => {
    useAuthStore.getState().setSession({ accessToken: 'old', user: testUser });
    refreshReturns(() => apiError(503, 'INTERNAL_ERROR'));

    await expect(refreshSession()).resolves.toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', accessToken: 'old' });
  });
});

describe('bootstrapSession', () => {
  it('restores the session from the refresh cookie', async () => {
    refreshReturns(okRefresh);
    await bootstrapSession();
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('ends as anonymous when there is no session', async () => {
    refreshReturns(() => apiError(401, 'INVALID_REFRESH'));
    await bootstrapSession();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('ends as anonymous when the API is unreachable', async () => {
    refreshReturns(() => HttpResponse.error());
    await bootstrapSession();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('does nothing when the session is already known', async () => {
    const refresh = refreshReturns(okRefresh);
    useAuthStore.getState().clearSession();
    await bootstrapSession();
    expect(refresh.calls()).toBe(0);
  });
});

describe('installAuth', () => {
  it('lets API calls recover from an expired access token', async () => {
    installAuth();
    useAuthStore.getState().setSession({ accessToken: 'expired-token', user: testUser });
    refreshReturns(okRefresh);
    server.use(
      http.get('*/api/v1/users/me', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer fresh-token'
          ? HttpResponse.json(testUser)
          : apiError(401, 'UNAUTHORIZED'),
      ),
    );

    await expect(apiRequest('/users/me')).resolves.toEqual(testUser);
    expect(useAuthStore.getState().accessToken).toBe('fresh-token');
  });
});
