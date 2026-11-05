import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { BoardRole } from '@trello/contracts';
import { invalidAccessToken } from '../auth/auth.errors.js';
import type { RequestWithUser } from '../common/decorators/current-user.decorator.js';
import {
  attachmentNotFound,
  boardNotFound,
  cardNotFound,
  checklistItemNotFound,
  checklistNotFound,
  commentNotFound,
  labelNotFound,
  listNotFound,
} from './access.errors.js';
import { BoardAccessService } from './board-access.service.js';

/** Metadata key for the minimum role, set by @BoardRole(). */
export const BOARD_ROLE_KEY = 'boardRole';

export interface BoardAccess {
  boardId: string;
  role: BoardRole;
}

export interface BoardRequest extends RequestWithUser {
  params: Record<string, string | undefined>;
  /** Set by BoardAccessGuard. */
  boardAccess?: BoardAccess;
}

interface Target {
  boardId: string | null;
  notFound: () => HttpException;
}

/**
 * Checks board membership for routes marked with @BoardRole(). Runs after JwtAuthGuard.
 * The board comes from the first of these params that the route has, in this
 * fixed order (not the order in the path): `:boardId`, `:listId`, `:cardId`,
 * `:checklistId`, `:itemId`, `:labelId`, `:commentId`, `:attachmentId`. A route with two of them, such as
 * `/cards/:cardId/labels/:labelId`, is authorized through the first one; the
 * service has to check the second against that board.
 */
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
    const request = context.switchToHttp().getRequest<BoardRequest>();
    const target = await this.resolveTarget(request.params);
    // Misconfiguration: the guard must never silently allow a route.
    if (!min || !target) return false;
    if (!request.user) throw invalidAccessToken();

    const role = await this.access.requireRole(
      target.boardId,
      request.user.id,
      min,
      target.notFound,
    );
    request.boardAccess = { boardId: target.boardId as string, role };
    return true;
  }

  private async resolveTarget(params: BoardRequest['params']): Promise<Target | null> {
    if (params.boardId !== undefined) {
      return { boardId: params.boardId, notFound: boardNotFound };
    }
    if (params.listId !== undefined) {
      return { boardId: await this.access.boardIdOfList(params.listId), notFound: listNotFound };
    }
    if (params.cardId !== undefined) {
      return { boardId: await this.access.boardIdOfCard(params.cardId), notFound: cardNotFound };
    }
    if (params.checklistId !== undefined) {
      return {
        boardId: await this.access.boardIdOfChecklist(params.checklistId),
        notFound: checklistNotFound,
      };
    }
    if (params.itemId !== undefined) {
      return {
        boardId: await this.access.boardIdOfChecklistItem(params.itemId),
        notFound: checklistItemNotFound,
      };
    }
    if (params.labelId !== undefined) {
      return { boardId: await this.access.boardIdOfLabel(params.labelId), notFound: labelNotFound };
    }
    if (params.commentId !== undefined) {
      return {
        boardId: await this.access.boardIdOfComment(params.commentId),
        notFound: commentNotFound,
      };
    }
    if (params.attachmentId !== undefined) {
      return {
        boardId: await this.access.boardIdOfAttachment(params.attachmentId),
        notFound: attachmentNotFound,
      };
    }
    return null;
  }
}
