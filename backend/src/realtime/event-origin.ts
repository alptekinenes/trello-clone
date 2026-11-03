import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ErrorCode, SOCKET_ID_HEADER } from '@trello/contracts';
import type { RequestWithUser } from '../common/decorators/current-user.decorator.js';

/** Who caused a change, and from which socket, so the broadcast can skip that socket. */
export interface EventOrigin {
  /** The user whose request caused the change. */
  actorId: string;
  /** The request's X-Socket-Id; left out of the broadcast when it is one of the actor's sockets. */
  socketId: string | null;
}

const SOCKET_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** A usable socket id from a header value, or null. A bad id is ignored, never an error. */
export function parseSocketId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return SOCKET_ID_PATTERN.test(value) ? value : null;
}

interface RequestWithHeaders extends RequestWithUser {
  headers: Record<string, string | string[] | undefined>;
}

export function resolveEventOrigin(request: RequestWithHeaders): EventOrigin {
  if (!request.user) {
    throw new UnauthorizedException({ code: ErrorCode.UNAUTHORIZED, message: 'Not authenticated' });
  }
  return { actorId: request.user.id, socketId: parseSocketId(request.headers[SOCKET_ID_HEADER]) };
}

/** Injects the EventOrigin of the current request. */
export const CurrentEventOrigin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): EventOrigin =>
    resolveEventOrigin(ctx.switchToHttp().getRequest<RequestWithHeaders>()),
);
