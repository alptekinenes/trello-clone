import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { BoardRole as BoardRoleName } from '@trello/contracts';
import { BOARD_ROLE_KEY, BoardAccessGuard, type BoardRequest } from './board-access.guard.js';

/**
 * Requires the current user to have at least `min` role on the board
 * named by the `:boardId` route param.
 */
export const BoardRole = (min: BoardRoleName) =>
  applyDecorators(SetMetadata(BOARD_ROLE_KEY, min), UseGuards(BoardAccessGuard));

/** The current user's role on the board, resolved by @BoardRole(). */
export const CurrentBoardRole = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): BoardRoleName => {
    const role = ctx.switchToHttp().getRequest<BoardRequest>().boardRole;
    if (!role) throw new Error('CurrentBoardRole used on a route without @BoardRole()');
    return role;
  },
);
