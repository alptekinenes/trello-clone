import { Injectable } from '@nestjs/common';
import type {
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
import type { Anchors } from '../ordering/placement.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CARD_ORDER, CARD_SELECT, toCardSummary } from './card.mapper.js';

type Tx = Prisma.TransactionClient;

interface CurrentCard {
  listId: string;
  archivedAt: Date | null;
}

/**
 * Card CRUD and ordering. A write that changes positions in a list, or moves
 * a card in or out of it, locks that list first (see lockLists).
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active cards on active lists, or every archived card of the board (newest first). */
  async listForBoard(boardId: string, archived: boolean): Promise<CardSummaryDto[]> {
    const cards = await this.prisma.card.findMany({
      where: archived
        ? { boardId, archivedAt: { not: null } }
        : { boardId, archivedAt: null, list: { archivedAt: null } },
      select: CARD_SELECT,
      orderBy: archived ? [{ archivedAt: 'desc' }, { id: 'asc' }] : [...CARD_ORDER],
    });
    return cards.map(toCardSummary);
  }

  create(boardId: string, listId: string, input: CreateCardRequest): Promise<CardSummaryDto> {
    return this.prisma.$transaction(async (tx) => {
      const [list] = await lockLists(tx, boardId, [listId]);
      if (!list) throw listNotFound();
      if (list.archivedAt) throw invalidTarget('Cards cannot be added to an archived list');

      const position = await this.place(tx, listId, null, {
        afterId: input.afterCardId,
        beforeId: input.beforeCardId,
      });
      const card = await tx.card.create({
        data: { boardId, listId, title: input.title, position },
        select: CARD_SELECT,
      });
      return toCardSummary(card);
    });
  }

  /**
   * Renames, archives, or restores the card. A restored card goes to the end of
   * its list, which must not be archived itself.
   */
  update(boardId: string, cardId: string, input: UpdateCardRequest): Promise<CardSummaryDto> {
    return this.prisma.$transaction(async (tx) => {
      // Only a restore changes positions, so only a restore takes the list lock.
      const restoring = input.archived === false;
      const { card: current, activeListIds } = restoring
        ? await this.lockCard(tx, boardId, cardId)
        : { card: await this.findOnBoard(tx, boardId, cardId), activeListIds: null };

      const data: Prisma.CardUpdateInput = { title: input.title };
      if (input.archived === true && !current.archivedAt) {
        data.archivedAt = new Date();
      }
      if (restoring && current.archivedAt) {
        if (!activeListIds?.has(current.listId)) {
          throw invalidTarget('The list of this card is archived. Restore the list first.');
        }
        data.archivedAt = null;
        data.position = await this.place(tx, current.listId, cardId, {});
      }

      const card = await tx.card.update({ where: { id: cardId }, data, select: CARD_SELECT });
      return toCardSummary(card);
    });
  }

  /** Moves the card within its list or to another active list of the same board. */
  move(boardId: string, cardId: string, input: MoveCardRequest): Promise<MoveCardResponse> {
    return this.prisma.$transaction(async (tx) => {
      const { card, activeListIds } = await this.lockCard(tx, boardId, cardId, input.listId);
      if (!activeListIds.has(input.listId)) {
        throw invalidTarget('The target list is not an active list on this board');
      }
      if (card.archivedAt) throw invalidTarget('Archived cards cannot be moved');

      const position = await this.place(tx, input.listId, cardId, {
        afterId: input.afterCardId,
        beforeId: input.beforeCardId,
      });
      await tx.card.update({ where: { id: cardId }, data: { listId: input.listId, position } });
      return { id: cardId, listId: input.listId, position };
    });
  }

  async remove(cardId: string): Promise<void> {
    await this.prisma.card.delete({ where: { id: cardId } });
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
  ): Promise<number> {
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
