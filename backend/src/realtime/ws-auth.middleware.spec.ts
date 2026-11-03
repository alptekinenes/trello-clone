import { Logger } from '@nestjs/common';
import { REALTIME_UNAUTHORIZED } from '@trello/contracts';
import type { TokenService } from '../auth/token.service.js';
import type { RealtimeSocket } from './realtime.types.js';
import { createWsAuthMiddleware } from './ws-auth.middleware.js';

const USER = { id: 'user-1', email: 'ayse@example.com' };
const EXPIRES_AT = 1_800_000_000_000;
const SECRET_TOKEN = 'secret-token-value';

function setup(auth: unknown) {
  const verify = vi.fn().mockResolvedValue({ user: USER, expiresAt: EXPIRES_AT });
  const middleware = createWsAuthMiddleware({
    verifyAccessTokenWithExpiry: verify,
  } as Pick<TokenService, 'verifyAccessTokenWithExpiry'>);
  const socket = { handshake: { auth }, data: {} } as unknown as RealtimeSocket;
  return { verify, middleware, socket };
}

/** Runs the middleware and resolves with what it passed to next(). */
function run(
  middleware: ReturnType<typeof createWsAuthMiddleware>,
  socket: RealtimeSocket,
): Promise<{ args: unknown[] }> {
  return new Promise((resolve) => {
    middleware(socket, (...args: unknown[]) => resolve({ args }));
  });
}

describe('createWsAuthMiddleware', () => {
  it.each([
    ['no auth payload', undefined],
    ['null auth payload', null],
    ['no token', {}],
    ['a numeric token', { token: 12 }],
    ['an empty token', { token: '' }],
    ['an object token', { token: { value: 'x' } }],
  ])('rejects %s', async (_label, auth) => {
    const { middleware, socket, verify } = setup(auth);

    const { args } = await run(middleware, socket);

    expect(args).toHaveLength(1);
    const error = args[0] as Error & { data?: unknown };
    expect(error.message).toBe(REALTIME_UNAUTHORIZED);
    expect(error.data).toEqual({ code: REALTIME_UNAUTHORIZED });
    expect(verify).not.toHaveBeenCalled();
    expect(socket.data).toEqual({});
  });

  it('rejects a token that fails verification with the same error', async () => {
    const { middleware, socket, verify } = setup({ token: SECRET_TOKEN });
    verify.mockRejectedValue(new Error('jwt expired'));

    const { args } = await run(middleware, socket);

    const error = args[0] as Error & { data?: unknown };
    expect(error.message).toBe(REALTIME_UNAUTHORIZED);
    expect(error.data).toEqual({ code: REALTIME_UNAUTHORIZED });
    expect(socket.data).toEqual({});
  });

  it('stores the user and the expiry on the socket and calls next without an error', async () => {
    const { middleware, socket, verify } = setup({ token: SECRET_TOKEN });

    const { args } = await run(middleware, socket);

    expect(args).toEqual([]);
    expect(verify).toHaveBeenCalledWith(SECRET_TOKEN);
    expect(socket.data).toEqual({ user: USER, expiresAt: EXPIRES_AT, roomSeq: 0 });
  });

  it('never logs the token', async () => {
    const spies = [
      vi.spyOn(Logger.prototype, 'log'),
      vi.spyOn(Logger.prototype, 'warn'),
      vi.spyOn(Logger.prototype, 'error'),
      vi.spyOn(Logger.prototype, 'debug'),
    ];
    const consoleSpy = vi.spyOn(console, 'log');
    const { middleware, socket, verify } = setup({ token: SECRET_TOKEN });
    verify.mockRejectedValueOnce(new Error('bad'));

    await run(middleware, socket);
    await run(middleware, socket);

    for (const spy of [...spies, consoleSpy]) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET_TOKEN);
    }
    vi.restoreAllMocks();
  });
});
