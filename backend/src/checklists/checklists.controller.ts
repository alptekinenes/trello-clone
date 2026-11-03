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
import type { ChecklistDto, MoveChecklistResponse } from '@trello/contracts';
import { BoardRole, CurrentBoardId } from '../access/board-role.decorator.js';
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
import { ChecklistsService } from './checklists.service.js';
import {
  ChecklistAnchorsDto,
  CreateChecklistDto,
  UpdateChecklistDto,
} from './dto/checklist.dto.js';

@Controller('cards/:cardId/checklists')
export class CardChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}

  @Post()
  @BoardRole('MEMBER')
  create(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @Body() body: CreateChecklistDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<ChecklistDto> {
    return this.checklists.create(boardId, cardId, body, origin);
  }
}

@Controller('checklists/:checklistId')
export class ChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}

  @Patch()
  @BoardRole('MEMBER')
  rename(
    @CurrentBoardId() boardId: string,
    @Param('checklistId') checklistId: string,
    @Body() body: UpdateChecklistDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<ChecklistDto> {
    return this.checklists.rename(boardId, checklistId, body, origin);
  }

  @Post('move')
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.OK)
  move(
    @CurrentBoardId() boardId: string,
    @Param('checklistId') checklistId: string,
    @Body() body: ChecklistAnchorsDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<MoveChecklistResponse> {
    return this.checklists.move(boardId, checklistId, body, origin);
  }

  @Delete()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentBoardId() boardId: string,
    @Param('checklistId') checklistId: string,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.checklists.remove(boardId, checklistId, origin);
  }
}
