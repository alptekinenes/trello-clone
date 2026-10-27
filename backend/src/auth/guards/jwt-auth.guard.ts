import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import type { RequestWithUser } from '../../common/decorators/current-user.decorator.js';
import { invalidAccessToken } from '../auth.errors.js';
import { TokenService } from '../token.service.js';

interface HttpRequest extends RequestWithUser {
  headers: { authorization?: string };
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) return null;
  return token;
}

/**
 * Global guard: every HTTP route needs a valid access token unless marked @Public().
 * Other transports are denied here; WebSocket auth happens at connection time.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    if (context.getType() !== 'http') return false;

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw invalidAccessToken();

    request.user = await this.tokens.verifyAccessToken(token);
    return true;
  }
}
