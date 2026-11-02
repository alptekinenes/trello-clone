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
  create(@Param('boardId') boardId: string, @Body() body: CreateListDto): Promise<ListDto> {
    return this.lists.create(boardId, body);
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
  ): Promise<ListDto> {
    return this.lists.update(boardId, listId, body);
  }

  @Post('move')
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.OK)
  move(
    @CurrentBoardId() boardId: string,
    @Param('listId') listId: string,
    @Body() body: ListAnchorsDto,
  ): Promise<MoveListResponse> {
    return this.lists.move(boardId, listId, body);
  }

  @Delete()
  @BoardRole('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('listId') listId: string): Promise<void> {
    return this.lists.remove(listId);
  }
}
