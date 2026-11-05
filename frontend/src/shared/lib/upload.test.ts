import { ErrorCode, SOCKET_ID_HEADER } from '@trello/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeXhr, installFakeXhr, restoreXhr } from '../../test/fake-xhr';
import { ApiError, setAuthHandlers, setSocketIdSource } from './http';
import { apiUpload } from './upload';

const body = () => {
  const form = new FormData();
  form.append('file', new File(['abc'], 'a.txt', { type: 'text/plain' }));
  return form;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => installFakeXhr());
afterEach(() => {
  restoreXhr();
  setSocketIdSource(() => null);
  setAuthHandlers(null);
});

describe('apiUpload', () => {
  it('posts the form with the Bearer token and the socket id, and reports progress', async () => {
    setAuthHandlers({ getAccessToken: () => 'token-1', refreshAccessToken: vi.fn() });
    setSocketIdSource(() => 'socket-9');
    const onProgress = vi.fn();

    const result = apiUpload<{ ok: boolean }>('/cards/c1/attachments', body(), { onProgress });
    const xhr = FakeXhr.last;
    xhr.progress(30, 100);
    xhr.respond(201, { ok: true });

    await expect(result).resolves.toEqual({ ok: true });
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toMatch(/\/api\/v1\/cards\/c1\/attachments$/);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers.Authorization).toBe('Bearer token-1');
    expect(xhr.headers[SOCKET_ID_HEADER]).toBe('socket-9');
    expect(xhr.body).toBeInstanceOf(FormData);
    expect(onProgress).toHaveBeenCalledWith(30, 100);
  });

  it('throws an ApiError with the error body', async () => {
    const error = { statusCode: 415, code: ErrorCode.UNSUPPORTED_FILE_TYPE, message: 'no' };
    const result = apiUpload('/x', body());
    FakeXhr.last.respond(415, error);

    await expect(result).rejects.toMatchObject({ status: 415, code: ErrorCode.UNSUPPORTED_FILE_TYPE });
    await expect(result).rejects.toBeInstanceOf(ApiError);
  });

  it('throws an ApiError without a body when the answer is not JSON', async () => {
    const result = apiUpload('/x', body());
    FakeXhr.last.respond(413, '<html>too large</html>');

    await expect(result).rejects.toMatchObject({ status: 413, body: null });
  });

  it('refreshes the session once on 401 and sends the form again', async () => {
    const refreshAccessToken = vi.fn().mockResolvedValue('token-2');
    setAuthHandlers({ getAccessToken: () => 'token-1', refreshAccessToken });

    const result = apiUpload<{ ok: boolean }>('/x', body());
    FakeXhr.last.respond(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'no' });
    await settle();
    expect(FakeXhr.instances).toHaveLength(2);
    FakeXhr.last.respond(201, { ok: true });

    await expect(result).resolves.toEqual({ ok: true });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(FakeXhr.last.headers.Authorization).toBe('Bearer token-2');
  });

  it('gives up with the 401 when the session cannot be refreshed', async () => {
    setAuthHandlers({ getAccessToken: () => 'token-1', refreshAccessToken: async () => null });

    const result = apiUpload('/x', body());
    FakeXhr.last.respond(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'no' });

    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(FakeXhr.instances).toHaveLength(1);
  });

  it('aborts the request when the signal fires', async () => {
    const controller = new AbortController();
    const result = apiUpload('/x', body(), { signal: controller.signal });
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.last.aborted).toBe(true);
  });

  it('does not send anything when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(apiUpload('/x', body(), { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('rejects with a TypeError when the network fails', async () => {
    const result = apiUpload('/x', body());
    FakeXhr.last.fail();

    await expect(result).rejects.toBeInstanceOf(TypeError);
  });
});
