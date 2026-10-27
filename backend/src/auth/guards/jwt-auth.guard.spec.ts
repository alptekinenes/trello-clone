import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import type { TokenService } from '../token.service.js';
import { extractBearerToken, JwtAuthGuard } from './jwt-auth.guard.js';

const USER = { id: 'user-1', email: 'ayse@example.com' };

function createContext(
  request: { headers: Record<string, string | undefined>; user?: unknown },
  type = 'http',
): ExecutionContext {
  class PublicController {}
  return {
    getType: () => type,
    getHandler: () => function handler() {},
    getClass: () => PublicController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function setup(isPublic = false) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
    key === IS_PUBLIC_KEY ? isPublic : undefined,
  );
  const tokens = { verifyAccessToken: vi.fn().mockResolvedValue(USER) };
  const guard = new JwtAuthGuard(reflector, tokens as unknown as TokenService);
  return { guard, tokens };
}

describe('extractBearerToken', () => {
  it.each([
    ['Bearer abc.def.ghi', 'abc.def.ghi'],
    ['bearer abc', 'abc'],
    [undefined, null],
    ['', null],
    ['Basic abc', null],
    ['Bearer', null],
    ['Bearer a b', null],
  ])('%s -> %s', (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });
});

describe('JwtAuthGuard', () => {
  it('lets public routes through without a token', async () => {
    const { guard, tokens } = setup(true);
    await expect(guard.canActivate(createContext({ headers: {} }))).resolves.toBe(true);
    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a request without a token', async () => {
    const { guard } = setup();
    await expect(guard.canActivate(createContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the user for a valid token', async () => {
    const { guard, tokens } = setup();
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: 'Bearer good-token' },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(tokens.verifyAccessToken).toHaveBeenCalledWith('good-token');
    expect(request.user).toEqual(USER);
  });

  it('rejects when the token fails verification', async () => {
    const { guard, tokens } = setup();
    tokens.verifyAccessToken.mockRejectedValue(new UnauthorizedException());
    await expect(
      guard.canActivate(createContext({ headers: { authorization: 'Bearer bad' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('denies non-HTTP contexts that are not public', async () => {
    const { guard } = setup();
    await expect(guard.canActivate(createContext({ headers: {} }, 'ws'))).resolves.toBe(false);
  });
});
