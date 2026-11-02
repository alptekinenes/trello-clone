import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { BoardRole as BoardRoleName } from '@trello/contracts';
import {
  type BoardAccess,
  BOARD_ROLE_KEY,
  BoardAccessGuard,
  type BoardRequest,
} from './board-access.guard.js';

/**
 * Requires the current user to have at least `min` role on the board named
 * by the `:boardId` route param, or on the board of the list, card, checklist,
 * checklist item or label named by the first of `:listId`, `:cardId`, `:checklistId`,
 * `:itemId`, `:labelId` that the route has.
 */
export const BoardRole = (min: BoardRoleName) =>
  applyDecorators(SetMetadata(BOARD_ROLE_KEY, min), UseGuards(BoardAccessGuard));

function boardAccessOf(ctx: ExecutionContext): BoardAccess {
  const access = ctx.switchToHttp().getRequest<BoardRequest>().boardAccess;
  if (!access) throw new Error('Board access read on a route without @BoardRole()');
  return access;
}

/** The current user's role on the board, resolved by @BoardRole(). */
export const CurrentBoardRole = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): BoardRoleName => boardAccessOf(ctx).role,
);

/** The board the route acts on, resolved by @BoardRole() (useful on /lists/:listId and /cards/:cardId routes). */
export const CurrentBoardId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => boardAccessOf(ctx).boardId,
);
