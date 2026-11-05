import { Injectable } from '@nestjs/common';
import type {
  ActivityDto,
  CardDetailDto,
  CardSummaryDto,
  CreateCardRequest,
  MoveCardRequest,
  MoveCardResponse,
  UpdateCardRequest,
} from '@trello/contracts';
import { cardNotFound, listNotFound } from '../access/access.errors.js';
import {
  type ActivityEntry,
  activityEvents,
  ActivityService,
} from '../activity/activity.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { type LockedList, lockCardRow, lockLists } from '../ordering/locks.js';
import { invalidTarget, positionConflict } from '../ordering/ordering.errors.js';
import { placeAndRebalance } from '../ordering/place-and-rebalance.js';
import type { Anchors, Placement, Sibling } from '../ordering/placement.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { rebalanceEvents, rebalancedData } from '../realtime/board-events.js';
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
  title: string;
  archivedAt: Date | null;
  completedAt: Date | null;
}

/** What a card write returns from its transaction: the result, the siblings that were respread and the activity it recorded. */
interface Written<T> {
  result: T;
  rebalanced: Sibling[] | null;
  activities: ActivityDto[];
}

/**
 * The log entries for the state changes a PATCH really made. A request that asks for
 * the state the card is already in (archived again, completed again) records nothing.
 */
function stateChanges(
  input: UpdateCardRequest,
  current: CurrentCard,
  cardTitle: string,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  if (input.archived === true && !current.archivedAt) {
    entries.push({ type: 'CARD_ARCHIVED', data: { cardTitle } });
  }
  if (input.archived === false && current.archivedAt) {
    entries.push({ type: 'CARD_RESTORED', data: { cardTitle } });
  }
  if (input.isCompleted === true && !current.completedAt) {
    entries.push({ type: 'CARD_COMPLETED', data: { cardTitle } });
  }
  if (input.isCompleted === false && current.completedAt) {
    entries.push({ type: 'CARD_UNCOMPLETED', data: { cardTitle } });
  }
  return entries;
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
    private readonly activity: ActivityService,
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
    const {
      result: card,
      rebalanced,
      activities,
    } = await this.prisma.$transaction(
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
        const recorded = await this.activity.record(
          tx,
          { boardId, cardId: created.id, actorId: origin.actorId },
          [
            {
              type: 'CARD_CREATED',
              data: { cardTitle: created.title, list: { id: list.id, title: list.title } },
            },
          ],
        );
        return {
          result: toCardSummary(created, false),
          rebalanced: placement.rebalanced,
          activities: recorded,
        };
      },
    );
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'card', listId }, rebalanced),
      { type: 'card:created', data: card },
      ...activityEvents(activities),
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
    const {
      result: card,
      rebalanced,
      activities,
    } = await this.prisma.$transaction(
      async (tx): Promise<Written<CardSummaryDto>> => {
        // Only a restore changes positions, so only a restore takes the list lock.
        const restoring = input.archived === false;
        const activeListIds = restoring
          ? (await this.lockCard(tx, boardId, cardId)).activeListIds
          : null;
        // A state change is logged once: the card row is locked and `current` read under it,
        // so two requests making the same change cannot both see the old state.
        // Lock order stays Board, List, Card (a restore took its list lock above).
        if (input.archived !== undefined || input.isCompleted !== undefined) {
          if (!(await lockCardRow(tx, boardId, cardId))) throw cardNotFound();
        }
        const current = await this.findOnBoard(tx, boardId, cardId);

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
        if (input.isCompleted !== undefined) {
          data.completedAt = input.isCompleted ? (current.completedAt ?? new Date()) : null;
        }
        if (input.coverColor !== undefined) data.coverColor = input.coverColor;
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
        const recorded = await this.activity.record(
          tx,
          { boardId, cardId, actorId: origin.actorId },
          stateChanges(input, current, updated.title),
        );
        return {
          result: toCardSummary(updated, description !== null),
          rebalanced: respread,
          activities: recorded,
        };
      },
    );
    // The description text itself is never broadcast; an open card reloads it when told to.
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'card', listId: card.listId }, rebalanced),
      {
        type: 'card:updated',
        data: { card, descriptionChanged: input.description !== undefined },
      },
      ...activityEvents(activities),
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
    const { fromListId, moved, rebalanced, activities } = await this.prisma.$transaction(async (tx) => {
      const { card, activeListIds, lists } = await this.lockCard(tx, boardId, cardId, input.listId);
      if (!activeListIds.has(input.listId)) {
        throw invalidTarget('The target list is not an active list on this board');
      }
      if (card.archivedAt) throw invalidTarget('Archived cards cannot be moved');

      const { position, rebalanced: respread } = await this.place(tx, input.listId, cardId, {
        afterId: input.afterCardId,
        beforeId: input.beforeCardId,
      });
      await tx.card.update({ where: { id: cardId }, data: { listId: input.listId, position } });
      const result = { id: cardId, listId: input.listId, position };
      // A change of order inside one list is not worth a log entry.
      const from = lists.find((list) => list.id === card.listId);
      const to = lists.find((list) => list.id === input.listId);
      const entries: ActivityEntry[] =
        from && to && from.id !== to.id
          ? [
              {
                type: 'CARD_MOVED',
                data: {
                  cardTitle: card.title,
                  fromList: { id: from.id, title: from.title },
                  toList: { id: to.id, title: to.title },
                },
              },
            ]
          : [];
      const recorded = await this.activity.record(
        tx,
        { boardId, cardId, actorId: origin.actorId },
        entries,
      );
      return { fromListId: card.listId, moved: result, rebalanced: respread, activities: recorded };
    });
    const target = { entity: 'card', listId: moved.listId } as const;
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents(target, rebalanced),
      {
        type: 'card:moved',
        data: {
          id: moved.id,
          fromListId,
          toListId: moved.listId,
          position: moved.position,
        },
      },
      ...activityEvents(activities),
    ]);
    return { ...moved, rebalanced: rebalancedData(target, rebalanced) };
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
  ): Promise<{ card: CurrentCard; activeListIds: Set<string>; lists: LockedList[] }> {
    const before = await this.findOnBoard(tx, boardId, cardId);
    const listIds = targetListId ? [before.listId, targetListId] : [before.listId];
    const locked = await lockLists(tx, boardId, listIds);

    const card = await this.findOnBoard(tx, boardId, cardId);
    // Someone moved the card to another list before we got the lock.
    if (card.listId !== before.listId) throw positionConflict();
    const active = locked.filter((list) => !list.archivedAt).map((list) => list.id);
    return { card, activeListIds: new Set(active), lists: locked };
  }

  private async findOnBoard(tx: Tx, boardId: string, cardId: string): Promise<CurrentCard> {
    const card = await tx.card.findFirst({
      where: { id: cardId, boardId },
      select: { listId: true, title: true, archivedAt: true, completedAt: true },
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
