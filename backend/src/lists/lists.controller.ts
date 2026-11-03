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
import type { ListDto, MoveListResponse } from '@trello/contracts';
import { BoardRole, CurrentBoardId } from '../access/board-role.decorator.js';
import { ArchivedQueryDto } from '../common/dto/archived-query.dto.js';
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
import { CreateListDto, ListAnchorsDto, UpdateListDto } from './dto/list.dto.js';
import { ListsService } from './lists.service.js';

@Controller('boards/:boardId/lists')
export class BoardListsController {
  constructor(private readonly lists: ListsService) {}

  @Get()
  @BoardRole('MEMBER')
  list(@Param('boardId') boardId: string, @Query() query: ArchivedQueryDto): Promise<ListDto[]> {
    return this.lists.listForBoard(boardId, query.archived ?? false);
  }

  @Post()
  @BoardRole('MEMBER')
  create(
    @Param('boardId') boardId: string,
    @Body() body: CreateListDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<ListDto> {
    return this.lists.create(boardId, body, origin);
  }
}

@Controller('lists/:listId')
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Patch()
  @BoardRole('MEMBER')
  update(
    @CurrentBoardId() boardId: string,
    @Param('listId') listId: string,
    @Body() body: UpdateListDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<ListDto> {
    return this.lists.update(boardId, listId, body, origin);
  }

  @Post('move')
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.OK)
  move(
    @CurrentBoardId() boardId: string,
    @Param('listId') listId: string,
    @Body() body: ListAnchorsDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<MoveListResponse> {
    return this.lists.move(boardId, listId, body, origin);
  }

  @Delete()
  @BoardRole('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentBoardId() boardId: string,
    @Param('listId') listId: string,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.lists.remove(boardId, listId, origin);
  }
}
