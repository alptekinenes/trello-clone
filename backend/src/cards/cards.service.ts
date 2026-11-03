import { Injectable } from '@nestjs/common';
import type {
  CardDetailDto,
  CardSummaryDto,
  CreateCardRequest,
  MoveCardRequest,
  MoveCardResponse,
  UpdateCardRequest,
} from '@trello/contracts';
import { cardNotFound, listNotFound } from '../access/access.errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { lockLists } from '../ordering/locks.js';
import { invalidTarget, positionConflict } from '../ordering/ordering.errors.js';
import { placeAndRebalance } from '../ordering/place-and-rebalance.js';
import type { Anchors, Placement, Sibling } from '../ordering/placement.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { rebalanceEvents } from '../realtime/board-events.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { findCardSummaries } from './card-summaries.js';
import {
  CARD_DETAIL_SELECT,
  CARD_ORDER,
  CARD_SELECT,
  toCardDetail,
  toCardSummary,
} from './card.mapper.js';

type Tx = Prisma.TransactionClient;

interface CurrentCard {
  listId: string;
  archivedAt: Date | null;
}

/** What a card write returns from its transaction: the result and the siblings that were respread. */
interface Written<T> {
  result: T;
  rebalanced: Sibling[] | null;
}

/**
 * Card CRUD and ordering. A write that changes positions in a list, or moves
 * a card in or out of it, locks that list first (see lockLists).
 * Every write is broadcast to the board after its transaction committed.
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Active cards on active lists, or every archived card of the board (newest first). */
  listForBoard(boardId: string, archived: boolean): Promise<CardSummaryDto[]> {
    return findCardSummaries(
      this.prisma,
      archived
        ? { boardId, archivedAt: { not: null } }
        : { boardId, archivedAt: null, list: { archivedAt: null } },
      archived ? [{ archivedAt: 'desc' }, { id: 'asc' }] : [...CARD_ORDER],
    );
  }

  /** The card with its description and checklists. Archived cards are readable too. */
  async getDetail(boardId: string, cardId: string): Promise<CardDetailDto> {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, boardId },
      select: CARD_DETAIL_SELECT,
    });
    if (!card) throw cardNotFound();
    return toCardDetail(card);
  }

  async create(
    boardId: string,
    listId: string,
    input: CreateCardRequest,
    origin: EventOrigin,
  ): Promise<CardSummaryDto> {
    const { result: card, rebalanced } = await this.prisma.$transaction(
      async (tx): Promise<Written<CardSummaryDto>> => {
        const [list] = await lockLists(tx, boardId, [listId]);
        if (!list) throw listNotFound();
        if (list.archivedAt) throw invalidTarget('Cards cannot be added to an archived list');

        const placement = await this.place(tx, listId, null, {
          afterId: input.afterCardId,
          beforeId: input.beforeCardId,
        });
        const created = await tx.card.create({
          data: { boardId, listId, title: input.title, position: placement.position },
          select: CARD_SELECT,
        });
        return { result: toCardSummary(created, false), rebalanced: placement.rebalanced };
      },
    );
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'card', listId }, rebalanced),
      { type: 'card:created', data: card },
    ]);
    return card;
  }

  /**
   * Edits title, description and due date, archives, or restores the card. A restored card goes to the end of
   * its list, which must not be archived itself.
   */
  async update(
    boardId: string,
    cardId: string,
    input: UpdateCardRequest,
    origin: EventOrigin,
  ): Promise<CardSummaryDto> {
    const { result: card, rebalanced } = await this.prisma.$transaction(
      async (tx): Promise<Written<CardSummaryDto>> => {
        // Only a restore changes positions, so only a restore takes the list lock.
        const restoring = input.archived === false;
        const { card: current, activeListIds } = restoring
          ? await this.lockCard(tx, boardId, cardId)
          : { card: await this.findOnBoard(tx, boardId, cardId), activeListIds: null };

        // Completing without sending a date relies on the stored one; it may have
        // been cleared by someone else meanwhile, so that write is conditional.
        const completesStoredDate = input.dueComplete === true && input.dueDate === undefined;
        const data: Prisma.CardUpdateInput = {
          title: input.title,
          description: input.description,
          dueComplete: completesStoredDate ? undefined : input.dueComplete,
        };
        if (input.dueDate !== undefined) {
          data.dueDate = input.dueDate === null ? null : new Date(input.dueDate);
          // A cleared due date cannot stay "complete".
          if (input.dueDate === null) data.dueComplete = false;
        }
        if (completesStoredDate) {
          await tx.card.updateMany({
            where: { id: cardId, boardId, dueDate: { not: null } },
            data: { dueComplete: true },
          });
        }
        if (input.archived === true && !current.archivedAt) {
          data.archivedAt = new Date();
        }
        let respread: Sibling[] | null = null;
        if (restoring && current.archivedAt) {
          if (!activeListIds?.has(current.listId)) {
            throw invalidTarget('The list of this card is archived. Restore the list first.');
          }
          data.archivedAt = null;
          const placement = await this.place(tx, current.listId, cardId, {});
          data.position = placement.position;
          respread = placement.rebalanced;
        }

        const { description, ...updated } = await tx.card.update({
          where: { id: cardId },
          data,
          select: { ...CARD_SELECT, description: true },
        });
        return { result: toCardSummary(updated, description !== null), rebalanced: respread };
      },
    );
    // The description text itself is never broadcast; an open card reloads it when told to.
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'card', listId: card.listId }, rebalanced),
      {
        type: 'card:updated',
        data: { card, descriptionChanged: input.description !== undefined },
      },
    ]);
    return card;
  }

  /** Moves the card within its list or to another active list of the same board. */
  async move(
    boardId: string,
    cardId: string,
    input: MoveCardRequest,
    origin: EventOrigin,
  ): Promise<MoveCardResponse> {
    const { fromListId, moved, rebalanced } = await this.prisma.$transaction(async (tx) => {
      const { card, activeListIds } = await this.lockCard(tx, boardId, cardId, input.listId);
      if (!activeListIds.has(input.listId)) {
        throw invalidTarget('The target list is not an active list on this board');
      }
      if (card.archivedAt) throw invalidTarget('Archived cards cannot be moved');

      const { position, rebalanced: respread } = await this.place(tx, input.listId, cardId, {
        afterId: input.afterCardId,
        beforeId: input.beforeCardId,
      });
      await tx.card.update({ where: { id: cardId }, data: { listId: input.listId, position } });
      const result: MoveCardResponse = { id: cardId, listId: input.listId, position };
      return { fromListId: card.listId, moved: result, rebalanced: respread };
    });
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'card', listId: moved.listId }, rebalanced),
      {
        type: 'card:moved',
        data: {
          id: moved.id,
          fromListId,
          toListId: moved.listId,
          position: moved.position,
        },
      },
    ]);
    return moved;
  }

  async remove(boardId: string, cardId: string, origin: EventOrigin): Promise<void> {
    const { listId } = await this.prisma.card.delete({
      where: { id: cardId, boardId },
      select: { listId: true },
    });
    this.realtime.toBoard(boardId, origin, [
      { type: 'card:deleted', data: { id: cardId, listId } },
    ]);
  }

  /**
   * Locks the card's list, and `targetListId` when given, then reads the card
   * again under the lock. Also says which of the locked lists are active.
   */
  private async lockCard(
    tx: Tx,
    boardId: string,
    cardId: string,
    targetListId?: string,
  ): Promise<{ card: CurrentCard; activeListIds: Set<string> }> {
    const before = await this.findOnBoard(tx, boardId, cardId);
    const listIds = targetListId ? [before.listId, targetListId] : [before.listId];
    const locked = await lockLists(tx, boardId, listIds);

    const card = await this.findOnBoard(tx, boardId, cardId);
    // Someone moved the card to another list before we got the lock.
    if (card.listId !== before.listId) throw positionConflict();
    const active = locked.filter((list) => !list.archivedAt).map((list) => list.id);
    return { card, activeListIds: new Set(active) };
  }

  private async findOnBoard(tx: Tx, boardId: string, cardId: string): Promise<CurrentCard> {
    const card = await tx.card.findFirst({
      where: { id: cardId, boardId },
      select: { listId: true, archivedAt: true },
    });
    if (!card) throw cardNotFound();
    return card;
  }

  /**
   * Position for `cardId` (null for a new card) among the list's active cards.
   * Writes the new positions of the other cards when they had to be rebalanced.
   */
  private async place(
    tx: Tx,
    listId: string,
    cardId: string | null,
    anchors: Anchors,
  ): Promise<Placement> {
    const siblings = await tx.card.findMany({
      where: { listId, archivedAt: null, ...(cardId ? { id: { not: cardId } } : {}) },
      select: { id: true, position: true },
      orderBy: [...CARD_ORDER],
    });
    return placeAndRebalance(siblings, anchors, (id, position) =>
      tx.card.update({ where: { id }, data: { position } }),
    );
  }
}
