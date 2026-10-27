import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { AuthResponse } from '@trello/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { API_PREFIX } from '../app.constants.js';
import { Public } from '../common/decorators/public.decorator.js';
import { authRateLimit } from '../config/env.validation.js';
import { invalidRefresh } from './auth.errors.js';
import { type AuthSession, AuthService } from './auth.service.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';

export const REFRESH_COOKIE = 'rt';

/** Brute-force protection for credential endpoints, per client IP. */
const CREDENTIALS_THROTTLE = { default: { limit: authRateLimit, ttl: 60_000 } };

function readRefreshCookie(request: Request): string | undefined {
  const value: unknown = request.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

@Public()
@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      secure: config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      // The cookie is only sent to auth endpoints, never to the rest of the API.
      path: `/${API_PREFIX}/auth`,
    };
  }

  @Throttle(CREDENTIALS_THROTTLE)
  @Post('register')
  async register(
    @Body() body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.register(body, request.get('user-agent'));
    return this.startSession(response, session);
  }

  @Throttle(CREDENTIALS_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.login(body, request.get('user-agent'));
    return this.startSession(response, session);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const token = readRefreshCookie(request);
    try {
      if (!token) throw invalidRefresh();
      const session = await this.auth.refresh(token, request.get('user-agent'));
      return this.startSession(response, session);
    } catch (error) {
      // Only a rejected token ends the session. A server error (e.g. DB down)
      // keeps the cookie so the user is not signed out by an outage.
      if (error instanceof UnauthorizedException) this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    this.clearRefreshCookie(response);
  }

  private startSession(response: Response, session: AuthSession): AuthResponse {
    response.cookie(REFRESH_COOKIE, session.refreshToken.token, {
      ...this.cookieOptions,
      expires: session.refreshToken.expiresAt,
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions);
  }
}
