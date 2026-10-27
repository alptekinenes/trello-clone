import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import type {
  BoardDetailDto,
  BoardRole as BoardRoleName,
  BoardSummaryDto,
} from '@trello/contracts';
import { BoardRole, CurrentBoardRole } from '../access/board-role.decorator.js';
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js';
import { BoardsService } from './boards.service.js';
import { CreateBoardDto, UpdateBoardDto } from './dto/board.dto.js';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<BoardSummaryDto[]> {
    return this.boards.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateBoardDto): Promise<BoardSummaryDto> {
    return this.boards.create(user.id, body);
  }

  @Get(':boardId')
  @BoardRole('MEMBER')
  detail(
    @Param('boardId') boardId: string,
    @CurrentBoardRole() role: BoardRoleName,
  ): Promise<BoardDetailDto> {
    return this.boards.getDetail(boardId, role);
  }

  @Patch(':boardId')
  @BoardRole('ADMIN')
  update(
    @Param('boardId') boardId: string,
    @CurrentBoardRole() role: BoardRoleName,
    @Body() body: UpdateBoardDto,
  ): Promise<BoardSummaryDto> {
    return this.boards.update(boardId, role, body);
  }

  @Delete(':boardId')
  @BoardRole('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('boardId') boardId: string): Promise<void> {
    return this.boards.remove(boardId);
  }
}
