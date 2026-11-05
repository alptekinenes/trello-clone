import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { BoardRole as BoardRoleName, CardFeedPageDto, CommentDto } from '@trello/contracts';
import { BoardRole, CurrentBoardId, CurrentBoardRole } from '../access/board-role.decorator.js';
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
import { CardFeedService } from './card-feed.service.js';
import { CommentsService } from './comments.service.js';
import { CommentBodyDto, FeedQueryDto } from './dto/comment.dto.js';

@Controller('cards/:cardId')
export class CardCommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly feed: CardFeedService,
  ) {}

  @Get('feed')
  @BoardRole('MEMBER')
  getFeed(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @Query() query: FeedQueryDto,
  ): Promise<CardFeedPageDto> {
    return this.feed.getPage(boardId, cardId, {
      details: query.details ?? false,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Post('comments')
  @BoardRole('MEMBER')
  create(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CommentBodyDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<CommentDto> {
    return this.comments.create(boardId, cardId, user.id, body, origin);
  }
}

@Controller('comments/:commentId')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Patch()
  @BoardRole('MEMBER')
  update(
    @CurrentBoardId() boardId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CommentBodyDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<CommentDto> {
    return this.comments.update(boardId, commentId, user.id, body, origin);
  }

  @Delete()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentBoardId() boardId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: AuthUser,
    @CurrentBoardRole() role: BoardRoleName,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.comments.remove(boardId, commentId, { userId: user.id, role }, origin);
  }
}
