import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { BoardRole } from '@trello/contracts';
import { invalidAccessToken } from '../auth/auth.errors.js';
import type { RequestWithUser } from '../common/decorators/current-user.decorator.js';
import { BoardAccessService } from './board-access.service.js';

/** Metadata key for the minimum role, set by @BoardRole(). */
export const BOARD_ROLE_KEY = 'boardRole';

export interface BoardRequest extends RequestWithUser {
  params: Record<string, string | undefined>;
  /** Set by BoardAccessGuard. */
  boardRole?: BoardRole;
}

/** Checks board membership for routes marked with @BoardRole(). Runs after JwtAuthGuard. */
@Injectable()
export class BoardAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: BoardAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const min = this.reflector.getAllAndOverride<BoardRole | undefined>(BOARD_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Misconfiguration: the guard must never silently allow a route.
    if (!min) return false;

    const request = context.switchToHttp().getRequest<BoardRequest>();
    if (!request.user) throw invalidAccessToken();

    request.boardRole = await this.access.requireRole(
      request.params.boardId ?? '',
      request.user.id,
      min,
    );
    return true;
  }
}
