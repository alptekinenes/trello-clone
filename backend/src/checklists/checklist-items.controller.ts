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
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
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
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<ChecklistItemDto> {
    return this.items.create(boardId, checklistId, body, origin);
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
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<ChecklistItemDto> {
    return this.items.update(boardId, itemId, body, origin);
  }

  @Post('move')
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.OK)
  move(
    @CurrentBoardId() boardId: string,
    @Param('itemId') itemId: string,
    @Body() body: MoveChecklistItemDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<MoveChecklistItemResponse> {
    return this.items.move(boardId, itemId, body, origin);
  }

  @Delete()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentBoardId() boardId: string,
    @Param('itemId') itemId: string,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.items.remove(boardId, itemId, origin);
  }
}
