import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import { hashToken, ROTATION_GRACE_MS, TokenService } from './token.service.js';

const SECRET = 'unit-test-secret-that-is-at-least-32-characters';
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'ayse@example.com' };
const NOW = new Date('2026-10-27T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function createPrismaMock() {
  const refreshToken = {
    findUnique: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'new-token-id' }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = {
    refreshToken,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ refreshToken })),
  };
  return { prisma, refreshToken };
}

function storedToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'old-token-id',
    userId: USER.id,
    familyId: 'family-1',
    tokenHash: hashToken('raw-token'),
    expiresAt: new Date(NOW.getTime() + DAY_MS),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    createdAt: new Date(NOW.getTime() - DAY_MS),
    ...overrides,
  };
}

async function expectAuthError(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).getResponse()).toMatchObject({ code });
}

describe('TokenService', () => {
  let jwt: JwtService;
  let mocks: ReturnType<typeof createPrismaMock>;
  let service: TokenService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: 900 } });
    mocks = createPrismaMock();
    const config = new ConfigService({ REFRESH_TOKEN_TTL_DAYS: 7 });
    service = new TokenService(jwt, mocks.prisma as unknown as PrismaService, config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('access tokens', () => {
    it('signs a token that verifies back to the same user', async () => {
      const token = await service.signAccessToken(USER);
      await expect(service.verifyAccessToken(token)).resolves.toEqual(USER);
    });

    it('rejects a token signed with another secret', async () => {
      const foreign = await new JwtService({ secret: 'x'.repeat(40) }).signAsync({
        sub: USER.id,
        email: USER.email,
      });
      await expectAuthError(service.verifyAccessToken(foreign), ErrorCode.UNAUTHORIZED);
    });

    it('rejects an expired token', async () => {
      const token = await service.signAccessToken(USER);
      vi.setSystemTime(new Date(NOW.getTime() + 901_000));
      await expectAuthError(service.verifyAccessToken(token), ErrorCode.UNAUTHORIZED);
    });

    it('rejects a token without a subject', async () => {
      const token = await jwt.signAsync({ email: USER.email });
      await expectAuthError(service.verifyAccessToken(token), ErrorCode.UNAUTHORIZED);
    });

    it('rejects garbage', async () => {
      await expectAuthError(service.verifyAccessToken('not.a.jwt'), ErrorCode.UNAUTHORIZED);
    });
  });

  describe('issueRefreshToken', () => {
    it('stores only the hash and returns the raw token with a 7 day expiry', async () => {
      const issued = await service.issueRefreshToken(USER.id, 'Vitest');

      expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(issued.expiresAt).toEqual(new Date(NOW.getTime() + 7 * DAY_MS));

      const { data } = mocks.refreshToken.create.mock.calls[0][0];
      expect(data).toMatchObject({
        userId: USER.id,
        tokenHash: hashToken(issued.token),
        expiresAt: issued.expiresAt,
        userAgent: 'Vitest',
      });
      expect(data.familyId).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.stringify(data)).not.toContain(issued.token);
    });

    it('truncates very long user agents', async () => {
      await service.issueRefreshToken(USER.id, 'a'.repeat(2000));
      expect(mocks.refreshToken.create.mock.calls[0][0].data.userAgent).toHaveLength(512);
    });
  });

  describe('rotateRefreshToken', () => {
    it('rejects an unknown token', async () => {
      mocks.refreshToken.findUnique.mockResolvedValue(null);
      await expectAuthError(service.rotateRefreshToken('raw-token'), ErrorCode.INVALID_REFRESH);
      expect(mocks.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken('raw-token') },
      });
    });

    it('rejects an expired token without revoking the family', async () => {
      mocks.refreshToken.findUnique.mockResolvedValue(storedToken({ expiresAt: NOW }));
      await expectAuthError(service.rotateRefreshToken('raw-token'), ErrorCode.INVALID_REFRESH);
      expect(mocks.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('revokes the whole family when an old rotated token is reused', async () => {
      mocks.refreshToken.findUnique.mockResolvedValue(
        storedToken({
          revokedAt: new Date(NOW.getTime() - ROTATION_GRACE_MS - 1),
          replacedById: 'newer-token-id',
        }),
      );

      await expectAuthError(service.rotateRefreshToken('raw-token'), ErrorCode.INVALID_REFRESH);
      expect(mocks.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: NOW },
      });
      expect(mocks.refreshToken.create).not.toHaveBeenCalled();
    });

    it('revokes the family when a logged-out token is used', async () => {
      mocks.refreshToken.findUnique.mockResolvedValue(storedToken({ revokedAt: NOW }));
      await expectAuthError(service.rotateRefreshToken('raw-token'), ErrorCode.INVALID_REFRESH);
      expect(mocks.refreshToken.updateMany).toHaveBeenCalledOnce();
    });

    it('does not revoke the family for a token rotated moments ago (parallel tabs)', async () => {
      mocks.refreshToken.findUnique.mockResolvedValue(
        storedToken({ revokedAt: new Date(NOW.getTime() - 1000), replacedById: 'newer-token-id' }),
      );
      await expectAuthError(service.rotateRefreshToken('raw-token'), ErrorCode.INVALID_REFRESH);
      expect(mocks.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('issues a new token in the same family and marks the old one replaced', async () => {
      mocks.refreshToken.findUnique.mockResolvedValue(storedToken());

      const result = await service.rotateRefreshToken('raw-token', 'Vitest');

      expect(result.userId).toBe(USER.id);
      expect(result.refreshToken.token).not.toBe('raw-token');
      expect(mocks.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: USER.id,
          familyId: 'family-1',
          tokenHash: hashToken(result.refreshToken.token),
          expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
          userAgent: 'Vitest',
        },
      });
      expect(mocks.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'old-token-id', revokedAt: null },
        data: { revokedAt: NOW, replacedById: 'new-token-id' },
      });
      expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    });

    it('fails when a parallel request already rotated the token', async () => {
      mocks.refreshToken.findUnique.mockResolvedValue(storedToken());
      mocks.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      await expectAuthError(service.rotateRefreshToken('raw-token'), ErrorCode.INVALID_REFRESH);
    });
  });

  describe('revokeRefreshToken', () => {
    it('revokes the token by its hash', async () => {
      await service.revokeRefreshToken('raw-token');
      expect(mocks.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: hashToken('raw-token'), revokedAt: null },
        data: { revokedAt: NOW },
      });
    });
  });
});
