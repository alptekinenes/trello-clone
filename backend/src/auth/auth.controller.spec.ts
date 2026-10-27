import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, type UserDto } from '@trello/contracts';
import type { Request, Response } from 'express';
import { AuthController, REFRESH_COOKIE } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

const USER: UserDto = { id: 'user-1', email: 'ayse@example.com', name: 'Ayşe', avatarUrl: null };
const EXPIRES = new Date('2026-11-03T12:00:00.000Z');
const SESSION = {
  accessToken: 'access-token',
  user: USER,
  refreshToken: { token: 'refresh-token', expiresAt: EXPIRES },
};
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

function setup(nodeEnv = 'development') {
  const auth = {
    register: vi.fn().mockResolvedValue(SESSION),
    login: vi.fn().mockResolvedValue(SESSION),
    refresh: vi.fn().mockResolvedValue(SESSION),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const controller = new AuthController(
    auth as unknown as AuthService,
    new ConfigService({ NODE_ENV: nodeEnv }),
  );
  const response = { cookie: vi.fn(), clearCookie: vi.fn() };
  const request = (cookies: Record<string, string> = {}) =>
    ({ cookies, get: () => 'Vitest' }) as unknown as Request;
  return { controller, auth, response, res: response as unknown as Response, request };
}

const credentials = { email: 'ayse@example.com', password: 'secret-password' };

describe('AuthController', () => {
  it('login returns the access token and sets the refresh token only as an httpOnly cookie', async () => {
    const { controller, auth, response, res, request } = setup();

    const body = await controller.login(credentials, request(), res);

    expect(auth.login).toHaveBeenCalledWith(credentials, 'Vitest');
    expect(body).toEqual({ accessToken: 'access-token', user: USER });
    expect(JSON.stringify(body)).not.toContain('refresh-token');
    expect(response.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'refresh-token', {
      ...COOKIE_OPTIONS,
      expires: EXPIRES,
    });
  });

  it('register sets the same cookie', async () => {
    const { controller, response, res, request } = setup();
    await controller.register({ ...credentials, name: 'Ayşe' }, request(), res);
    expect(response.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'refresh-token', {
      ...COOKIE_OPTIONS,
      expires: EXPIRES,
    });
  });

  it('marks the cookie Secure in production', async () => {
    const { controller, response, res, request } = setup('production');
    await controller.login(credentials, request(), res);
    expect(response.cookie.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it('refresh rotates using the cookie', async () => {
    const { controller, auth, response, res, request } = setup();

    const body = await controller.refresh(request({ [REFRESH_COOKIE]: 'old-token' }), res);

    expect(auth.refresh).toHaveBeenCalledWith('old-token', 'Vitest');
    expect(body).toEqual({ accessToken: 'access-token', user: USER });
    expect(response.cookie).toHaveBeenCalledOnce();
  });

  it('refresh without a cookie fails and clears the cookie', async () => {
    const { controller, auth, response, res, request } = setup();

    const error = await controller.refresh(request(), res).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_REFRESH,
    });
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(response.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, COOKIE_OPTIONS);
  });

  it('refresh clears the cookie when rotation fails', async () => {
    const { controller, auth, response, res, request } = setup();
    auth.refresh.mockRejectedValue(new UnauthorizedException());

    await expect(
      controller.refresh(request({ [REFRESH_COOKIE]: 'stolen' }), res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(response.clearCookie).toHaveBeenCalledOnce();
  });

  it('refresh keeps the cookie when the server fails', async () => {
    const { controller, auth, response, res, request } = setup();
    auth.refresh.mockRejectedValue(new Error('database unavailable'));

    await expect(
      controller.refresh(request({ [REFRESH_COOKIE]: 'valid' }), res),
    ).rejects.toThrow('database unavailable');
    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  it('logout revokes the cookie token and clears the cookie', async () => {
    const { controller, auth, response, res, request } = setup();

    await controller.logout(request({ [REFRESH_COOKIE]: 'current' }), res);

    expect(auth.logout).toHaveBeenCalledWith('current');
    expect(response.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, COOKIE_OPTIONS);
  });
});
