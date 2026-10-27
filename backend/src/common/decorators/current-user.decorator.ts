import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

/** Identity taken from a verified access token. */
export interface AuthUser {
  id: string;
  email: string;
}

export interface RequestWithUser {
  user?: AuthUser;
}

/** Injects the authenticated user set by JwtAuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  if (!request.user) {
    throw new UnauthorizedException({ code: ErrorCode.UNAUTHORIZED, message: 'Not authenticated' });
  }
  return request.user;
});
