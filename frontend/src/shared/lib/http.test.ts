import { ErrorCode } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fakeRealtime } from '../../test/fake-realtime';
import { server } from '../../test/msw-server';
import { ApiError, apiRequest, getAuthHandlers, setAuthHandlers } from './http';
import { realtime } from './realtime-client';

describe('apiRequest with auth handlers', () => {
  it('sends the access token as a Bearer header', async () => {
    let authorization: string | null = null;
    server.use(
      http.get('*/api/v1/me', ({ request }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json({ ok: true });
      }),
    );
    setAuthHandlers({ getAccessToken: () => 'token-1', refreshAccessToken: vi.fn() });

    await apiRequest('/me');

    expect(authorization).toBe('Bearer token-1');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get('*/api/v1/me', ({ request }) => {
        const header = request.headers.get('Authorization');
        seen.push(header);
        return header === 'Bearer fresh'
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({ code: 'UNAUTHORIZED', message: 'x', statusCode: 401 }, { status: 401 });
      }),
    );
    const refreshAccessToken = vi.fn().mockResolvedValue('fresh');
    setAuthHandlers({ getAccessToken: () => 'expired', refreshAccessToken });

    await expect(apiRequest('/me')).resolves.toEqual({ ok: true });
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(seen).toEqual(['Bearer expired', 'Bearer fresh']);
  });

  it('throws the 401 when the session cannot be refreshed', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/v1/me', () => {
        calls += 1;
        return HttpResponse.json({ code: 'UNAUTHORIZED', message: 'x', statusCode: 401 }, { status: 401 });
      }),
    );
    setAuthHandlers({ getAccessToken: () => 'expired', refreshAccessToken: async () => null });

    const error = await apiRequest('/me').catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401 });
    expect(calls).toBe(1);
  });

  it('skipAuth sends no token and never refreshes', async () => {
    let authorization: string | null = 'unset';
    server.use(
      http.post('*/api/v1/auth/login', ({ request }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json({ code: 'INVALID_CREDENTIALS', message: 'x', statusCode: 401 }, { status: 401 });
      }),
    );
    const refreshAccessToken = vi.fn();
    setAuthHandlers({ getAccessToken: () => 'token-1', refreshAccessToken });

    await expect(
      apiRequest('/auth/login', { method: 'POST', body: '{}' }, { skipAuth: true }),
    ).rejects.toMatchObject({ status: 401 });
    expect(authorization).toBeNull();
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});

describe('apiRequest', () => {
  it('returns parsed JSON for a successful response', async () => {
    server.use(http.get('*/api/v1/things', () => HttpResponse.json({ id: 1 })));
    await expect(apiRequest<{ id: number }>('/things')).resolves.toEqual({ id: 1 });
  });

  it('sends JSON with credentials and a JSON content type', async () => {
    let received: { body: unknown; contentType: string | null; credentials: string } | undefined;
    server.use(
      http.post('*/api/v1/things', async ({ request }) => {
        received = {
          body: await request.json(),
          contentType: request.headers.get('Content-Type'),
          credentials: request.credentials,
        };
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
    );

    await apiRequest('/things', { method: 'POST', body: JSON.stringify({ title: 'Yeni' }) });

    expect(received).toEqual({
      body: { title: 'Yeni' },
      contentType: 'application/json',
      credentials: 'include',
    });
  });

  it('returns undefined for 204 No Content', async () => {
    server.use(http.delete('*/api/v1/things/1', () => new HttpResponse(null, { status: 204 })));
    await expect(apiRequest('/things/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws ApiError with the API error body', async () => {
    server.use(
      http.get('*/api/v1/things', () =>
        HttpResponse.json(
          {
            statusCode: 404,
            code: ErrorCode.NOT_FOUND,
            message: 'Not found',
            path: '/api/v1/things',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
          { status: 404 },
        ),
      ),
    );

    const error = await apiRequest('/things').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: ErrorCode.NOT_FOUND, message: 'Not found' });
  });

  it('throws ApiError without a body when the response is not an API error', async () => {
    server.use(http.get('*/api/v1/things', () => new HttpResponse('Bad gateway', { status: 502 })));

    const error = await apiRequest('/things').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, body: null, code: undefined });
  });
});

describe('apiRequest with a live socket', () => {
  function captureSocketHeader() {
    const seen: (string | null)[] = [];
    server.use(
      http.get('*/api/v1/things', ({ request }) => {
        seen.push(request.headers.get('X-Socket-Id'));
        return HttpResponse.json({ ok: true });
      }),
    );
    return seen;
  }

  it('names the socket in X-Socket-Id so the server does not echo the change back', async () => {
    setAuthHandlers({ getAccessToken: () => 'token-1', refreshAccessToken: vi.fn() });
    realtime.start();
    fakeRealtime.connect();
    const seen = captureSocketHeader();

    await apiRequest('/things');

    expect(seen).toEqual(['fake-socket-id']);
  });

  it('sends no X-Socket-Id while the socket is not connected', async () => {
    setAuthHandlers({ getAccessToken: () => 'token-1', refreshAccessToken: vi.fn() });
    realtime.start();
    const seen = captureSocketHeader();

    await apiRequest('/things');

    expect(seen).toEqual([null]);
  });

  it('sends no X-Socket-Id on skipAuth requests', async () => {
    realtime.start();
    fakeRealtime.connect();
    const seen = captureSocketHeader();

    await apiRequest('/things', {}, { skipAuth: true });

    expect(seen).toEqual([null]);
  });

  it('hands the token source to the socket client through getAuthHandlers', () => {
    const handlers = { getAccessToken: () => 'token-1', refreshAccessToken: vi.fn() };
    setAuthHandlers(handlers);
    expect(getAuthHandlers()).toBe(handlers);
  });
});
