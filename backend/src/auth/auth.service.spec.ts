import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ErrorCode, type UserDto } from '@trello/contracts';
import { Prisma } from '../generated/prisma/client.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { PasswordService } from './password.service.js';
import type { TokenService } from './token.service.js';

const USER: UserDto = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ayse@example.com',
  name: 'Ayşe',
  avatarUrl: null,
};
const REFRESH = { token: 'refresh-token', expiresAt: new Date('2026-11-03T12:00:00.000Z') };

function setup() {
  const users = {
    create: vi.fn().mockResolvedValue(USER),
    findCredentialsByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(USER),
  };
  const tokens = {
    signAccessToken: vi.fn().mockResolvedValue('access-token'),
    issueRefreshToken: vi.fn().mockResolvedValue(REFRESH),
    rotateRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
  };
  const passwords = {
    hash: vi.fn().mockResolvedValue('argon-hash'),
    verify: vi.fn(),
    verifyAgainstDummy: vi.fn().mockResolvedValue(false),
  };
  const service = new AuthService(
    users as unknown as UsersService,
    tokens as unknown as TokenService,
    passwords as unknown as PasswordService,
  );
  return { service, users, tokens, passwords };
}

async function errorOf(promise: Promise<unknown>) {
  return promise.catch((e: unknown) => e);
}

describe('AuthService', () => {
  describe('register', () => {
    it('hashes the password, creates the user and starts a session', async () => {
      const { service, users, tokens, passwords } = setup();

      const session = await service.register(
        { email: 'ayse@example.com', password: 'secret-password', name: 'Ayşe' },
        'Vitest',
      );

      expect(passwords.hash).toHaveBeenCalledWith('secret-password');
      expect(users.create).toHaveBeenCalledWith({
        email: 'ayse@example.com',
        name: 'Ayşe',
        passwordHash: 'argon-hash',
      });
      expect(tokens.issueRefreshToken).toHaveBeenCalledWith(USER.id, 'Vitest');
      expect(session).toEqual({ accessToken: 'access-token', user: USER, refreshToken: REFRESH });
    });

    it('reports EMAIL_TAKEN when the email already exists', async () => {
      const { service, users } = setup();
      users.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const error = await errorOf(
        service.register({ email: 'ayse@example.com', password: 'secret-password', name: 'Ayşe' }),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: ErrorCode.EMAIL_TAKEN,
      });
    });

    it('rethrows unexpected errors', async () => {
      const { service, users } = setup();
      users.create.mockRejectedValue(new Error('db down'));
      await expect(
        service.register({ email: 'a@example.com', password: 'secret-password', name: 'A' }),
      ).rejects.toThrow('db down');
    });
  });

  describe('login', () => {
    it('runs a dummy check and fails for an unknown email', async () => {
      const { service, users, passwords, tokens } = setup();
      users.findCredentialsByEmail.mockResolvedValue(null);

      const error = await errorOf(service.login({ email: 'nobody@example.com', password: 'x' }));

      expect(passwords.verifyAgainstDummy).toHaveBeenCalledWith('x');
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: ErrorCode.INVALID_CREDENTIALS,
      });
      expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
    });

    it('fails with the same error for a wrong password', async () => {
      const { service, users, passwords } = setup();
      users.findCredentialsByEmail.mockResolvedValue({ ...USER, passwordHash: 'argon-hash' });
      passwords.verify.mockResolvedValue(false);

      const error = await errorOf(service.login({ email: USER.email, password: 'wrong' }));

      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: ErrorCode.INVALID_CREDENTIALS,
      });
    });

    it('starts a session without exposing the password hash', async () => {
      const { service, users, passwords } = setup();
      users.findCredentialsByEmail.mockResolvedValue({ ...USER, passwordHash: 'argon-hash' });
      passwords.verify.mockResolvedValue(true);

      const session = await service.login({ email: USER.email, password: 'secret-password' });

      expect(passwords.verify).toHaveBeenCalledWith('argon-hash', 'secret-password');
      expect(session.user).toEqual(USER);
      expect(session.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and signs a new access token', async () => {
      const { service, tokens } = setup();
      const next = { token: 'next-refresh', expiresAt: REFRESH.expiresAt };
      tokens.rotateRefreshToken.mockResolvedValue({ userId: USER.id, refreshToken: next });

      const session = await service.refresh('old-refresh', 'Vitest');

      expect(tokens.rotateRefreshToken).toHaveBeenCalledWith('old-refresh', 'Vitest');
      expect(session).toEqual({ accessToken: 'access-token', user: USER, refreshToken: next });
    });

    it('fails when the user no longer exists', async () => {
      const { service, tokens, users } = setup();
      tokens.rotateRefreshToken.mockResolvedValue({ userId: USER.id, refreshToken: REFRESH });
      users.findById.mockResolvedValue(null);

      const error = await errorOf(service.refresh('old-refresh'));

      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: ErrorCode.INVALID_REFRESH,
      });
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      const { service, tokens } = setup();
      await service.logout('refresh-token');
      expect(tokens.revokeRefreshToken).toHaveBeenCalledWith('refresh-token');
    });

    it('does nothing without a token', async () => {
      const { service, tokens } = setup();
      await service.logout(undefined);
      expect(tokens.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });
});
