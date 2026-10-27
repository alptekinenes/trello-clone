import { ErrorCode } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/msw-server';
import { ApiError, apiRequest } from './http';

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
