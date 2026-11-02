import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { ChecklistItemDto, MoveChecklistItemResponse } from '@trello/contracts';
import { BoardRole, CurrentBoardId } from '../access/board-role.decorator.js';
import { ChecklistItemsService } from './checklist-items.service.js';
import {
  CreateChecklistItemDto,
  MoveChecklistItemDto,
  UpdateChecklistItemDto,
} from './dto/checklist.dto.js';

@Controller('checklists/:checklistId/items')
export class ChecklistItemsCreateController {
  constructor(private readonly items: ChecklistItemsService) {}

  @Post()
  @BoardRole('MEMBER')
  create(
    @CurrentBoardId() boardId: string,
    @Param('checklistId') checklistId: string,
    @Body() body: CreateChecklistItemDto,
  ): Promise<ChecklistItemDto> {
    return this.items.create(boardId, checklistId, body);
  }
}

@Controller('checklist-items/:itemId')
export class ChecklistItemsController {
  constructor(private readonly items: ChecklistItemsService) {}

  @Patch()
  @BoardRole('MEMBER')
  update(
    @CurrentBoardId() boardId: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateChecklistItemDto,
  ): Promise<ChecklistItemDto> {
    return this.items.update(boardId, itemId, body);
  }

  @Post('move')
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.OK)
  move(
    @CurrentBoardId() boardId: string,
    @Param('itemId') itemId: string,
    @Body() body: MoveChecklistItemDto,
  ): Promise<MoveChecklistItemResponse> {
    return this.items.move(boardId, itemId, body);
  }

  @Delete()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentBoardId() boardId: string, @Param('itemId') itemId: string): Promise<void> {
    return this.items.remove(boardId, itemId);
  }
}
