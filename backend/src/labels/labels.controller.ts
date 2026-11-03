import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { LabelDto } from '@trello/contracts';
import { BoardRole, CurrentBoardId } from '../access/board-role.decorator.js';
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
import { CreateLabelDto, UpdateLabelDto } from './dto/label.dto.js';
import { LabelsService } from './labels.service.js';

@Controller('boards/:boardId/labels')
export class BoardLabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Post()
  @BoardRole('MEMBER')
  create(
    @Param('boardId') boardId: string,
    @Body() body: CreateLabelDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<LabelDto> {
    return this.labels.create(boardId, body, origin);
  }
}

@Controller('labels/:labelId')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Patch()
  @BoardRole('MEMBER')
  update(
    @CurrentBoardId() boardId: string,
    @Param('labelId') labelId: string,
    @Body() body: UpdateLabelDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<LabelDto> {
    return this.labels.update(boardId, labelId, body, origin);
  }

  @Delete()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentBoardId() boardId: string,
    @Param('labelId') labelId: string,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.labels.remove(boardId, labelId, origin);
  }
}

/** The board comes from the card; the service checks the label against it. */
@Controller('cards/:cardId/labels/:labelId')
export class CardLabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Put()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  assign(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.labels.assign(boardId, cardId, labelId, origin);
  }

  @Delete()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  unassign(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.labels.unassign(boardId, cardId, labelId, origin);
  }
}
