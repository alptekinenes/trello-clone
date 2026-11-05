import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { BoardRole, CurrentBoardId } from '../access/board-role.decorator.js';
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
import { CardMembersService } from './card-members.service.js';
import { CardWatchService } from './card-watch.service.js';

/** The board comes from the card; the service checks the user against it. */
@Controller('cards/:cardId/members/:userId')
export class CardMembersController {
  constructor(private readonly members: CardMembersService) {}

  @Put()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  assign(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.members.assign(boardId, cardId, userId, origin);
  }

  @Delete()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  unassign(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.members.unassign(boardId, cardId, userId, origin);
  }
}

@Controller('cards/:cardId/watch')
export class CardWatchController {
  constructor(private readonly watching: CardWatchService) {}

  @Put()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  watch(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @CurrentUser() user: AuthUser,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.watching.watch(boardId, cardId, user.id, origin);
  }

  @Delete()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  unwatch(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @CurrentUser() user: AuthUser,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.watching.unwatch(boardId, cardId, user.id, origin);
  }
}
