import { Injectable } from '@nestjs/common';
import type { LoginRequest, RegisterRequest, UserDto } from '@trello/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { UsersService } from '../users/users.service.js';
import { emailTaken, invalidCredentials, invalidRefresh } from './auth.errors.js';
import { PasswordService } from './password.service.js';
import { type IssuedRefreshToken, TokenService } from './token.service.js';

export interface AuthSession {
  accessToken: string;
  user: UserDto;
  refreshToken: IssuedRefreshToken;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
  ) {}

  async register(input: RegisterRequest, userAgent?: string): Promise<AuthSession> {
    const passwordHash = await this.passwords.hash(input.password);
    let user: UserDto;
    try {
      user = await this.users.create({ email: input.email, name: input.name, passwordHash });
    } catch (error) {
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
    return this.startSession(user, userAgent);
  }

  async login(input: LoginRequest, userAgent?: string): Promise<AuthSession> {
    const credentials = await this.users.findCredentialsByEmail(input.email);
    if (!credentials) {
      await this.passwords.verifyAgainstDummy(input.password);
      throw invalidCredentials();
    }
    if (!(await this.passwords.verify(credentials.passwordHash, input.password))) {
      throw invalidCredentials();
    }
    const user: UserDto = {
      id: credentials.id,
      email: credentials.email,
      name: credentials.name,
      avatarUrl: credentials.avatarUrl,
    };
    return this.startSession(user, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<AuthSession> {
    const rotated = await this.tokens.rotateRefreshToken(refreshToken, userAgent);
    const user = await this.users.findById(rotated.userId);
    if (!user) throw invalidRefresh();
    return {
      accessToken: await this.tokens.signAccessToken(user),
      user,
      refreshToken: rotated.refreshToken,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.tokens.revokeRefreshToken(refreshToken);
  }

  private async startSession(user: UserDto, userAgent?: string): Promise<AuthSession> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccessToken(user),
      this.tokens.issueRefreshToken(user.id, userAgent),
    ]);
    return { accessToken, user, refreshToken };
  }
}
