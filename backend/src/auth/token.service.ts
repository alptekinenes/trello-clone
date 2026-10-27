import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { invalidAccessToken, invalidRefresh } from './auth.errors.js';

const REFRESH_TOKEN_BYTES = 32;
const USER_AGENT_MAX = 512;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A token rotated less than this long ago is treated as a benign race
 * (two tabs refreshing at once), not as theft. It is still rejected,
 * but the token family is not revoked.
 */
export const ROTATION_GRACE_MS = 10_000;

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken {
  userId: string;
  refreshToken: IssuedRefreshToken;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Access tokens: short-lived JWTs, verified without a DB lookup.
 * Refresh tokens: opaque random strings stored only as sha256 hashes.
 * Every refresh rotates the token; reusing an old one revokes the whole family.
 */
@Injectable()
export class TokenService {
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.refreshTtlMs = config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * DAY_MS;
  }

  signAccessToken(user: AuthUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email });
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token);
    } catch {
      throw invalidAccessToken();
    }
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw invalidAccessToken();
    }
    return { id: payload.sub, email: payload.email };
  }

  async issueRefreshToken(
    userId: string,
    userAgent?: string,
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const issued = this.newRefreshToken(new Date());
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(issued.token),
        expiresAt: issued.expiresAt,
        userAgent: userAgent?.slice(0, USER_AGENT_MAX),
      },
    });
    return issued;
  }

  async rotateRefreshToken(token: string, userAgent?: string): Promise<RotatedRefreshToken> {
    const now = new Date();
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!current) throw invalidRefresh();

    if (current.revokedAt) {
      const rotatedJustNow =
        current.replacedById !== null &&
        now.getTime() - current.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (!rotatedJustNow) await this.revokeFamily(current.familyId, now);
      throw invalidRefresh();
    }

    if (current.expiresAt <= now) throw invalidRefresh();

    const next = this.newRefreshToken(now);
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: hashToken(next.token),
          expiresAt: next.expiresAt,
          userAgent: userAgent?.slice(0, USER_AGENT_MAX),
        },
      });
      // Only one concurrent request can win the rotation; the loser rolls back.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now, replacedById: created.id },
      });
      if (count === 0) throw invalidRefresh();
    });

    return { userId: current.userId, refreshToken: next };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private newRefreshToken(now: Date): IssuedRefreshToken {
    return {
      token: randomBytes(REFRESH_TOKEN_BYTES).toString('base64url'),
      expiresAt: new Date(now.getTime() + this.refreshTtlMs),
    };
  }
}
