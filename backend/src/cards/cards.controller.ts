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
import type { CardDetailDto, CardSummaryDto, MoveCardResponse } from '@trello/contracts';
import { BoardRole, CurrentBoardId } from '../access/board-role.decorator.js';
import { ArchivedQueryDto } from '../common/dto/archived-query.dto.js';
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
import { CardsService } from './cards.service.js';
import { CreateCardDto, MoveCardDto, UpdateCardDto } from './dto/card.dto.js';

@Controller('boards/:boardId/cards')
export class BoardCardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  @BoardRole('MEMBER')
  list(
    @Param('boardId') boardId: string,
    @Query() query: ArchivedQueryDto,
  ): Promise<CardSummaryDto[]> {
    return this.cards.listForBoard(boardId, query.archived ?? false);
  }
}

@Controller('lists/:listId/cards')
export class ListCardsController {
  constructor(private readonly cards: CardsService) {}

  @Post()
  @BoardRole('MEMBER')
  create(
    @CurrentBoardId() boardId: string,
    @Param('listId') listId: string,
    @Body() body: CreateCardDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<CardSummaryDto> {
    return this.cards.create(boardId, listId, body, origin);
  }
}

@Controller('cards/:cardId')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  @BoardRole('MEMBER')
  detail(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
  ): Promise<CardDetailDto> {
    return this.cards.getDetail(boardId, cardId);
  }

  @Patch()
  @BoardRole('MEMBER')
  update(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @Body() body: UpdateCardDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<CardSummaryDto> {
    return this.cards.update(boardId, cardId, body, origin);
  }

  @Post('move')
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.OK)
  move(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @Body() body: MoveCardDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<MoveCardResponse> {
    return this.cards.move(boardId, cardId, body, origin);
  }

  @Delete()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.cards.remove(boardId, cardId, origin);
  }
}
