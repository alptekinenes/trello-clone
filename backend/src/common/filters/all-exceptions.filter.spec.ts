import { ArgumentsHost, BadRequestException, HttpStatus, Logger } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { ErrorCode } from '@trello/contracts';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function setup() {
  const reply = vi.fn();
  const adapterHost = {
    httpAdapter: { reply, getRequestUrl: () => '/api/v1/boards' },
  } as unknown as HttpAdapterHost;
  const host = {
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
  } as unknown as ArgumentsHost;
  return { filter: new AllExceptionsFilter(adapterHost), host, reply };
}

describe('AllExceptionsFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers an unknown error with a generic 500 and no stack or message', () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { filter, host, reply } = setup();
    const error = new Error('connect ECONNREFUSED postgresql://trello:secret@db:5432/trello');

    filter.catch(error, host);

    expect(reply).toHaveBeenCalledTimes(1);
    const [, body, status] = reply.mock.calls[0] as [unknown, Record<string, unknown>, number];
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toMatchObject({
      statusCode: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      path: '/api/v1/boards',
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('ECONNREFUSED');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toMatch(/\bat .*\(/);
    expect(Object.keys(body).sort()).toEqual(
      ['code', 'message', 'path', 'statusCode', 'timestamp'].sort(),
    );
    // The detail stays in the server log only.
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('answers a thrown non-Error value with the same generic 500', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { filter, host, reply } = setup();

    filter.catch('token=abc', host);

    const [, body] = reply.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('token=abc');
  });

  it('does not log client errors', () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { filter, host } = setup();
    filter.catch(new BadRequestException('bad input'), host);
    expect(logged).not.toHaveBeenCalled();
  });
});
