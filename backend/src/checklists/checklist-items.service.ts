import { Injectable } from '@nestjs/common';
import type {
  ChecklistItemDto,
  CreateChecklistItemRequest,
  MoveChecklistItemRequest,
  MoveChecklistItemResponse,
  UpdateChecklistItemRequest,
} from '@trello/contracts';
import { checklistItemNotFound, checklistNotFound } from '../access/access.errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { lockCardRow } from '../ordering/locks.js';
import { invalidTarget } from '../ordering/ordering.errors.js';
import { placeAndRebalance } from '../ordering/place-and-rebalance.js';
import type { Anchors, Placement } from '../ordering/placement.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { rebalanceEvents } from '../realtime/board-events.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { countChecklistItems } from './checklist-counts.js';
import { ITEM_ORDER, ITEM_SELECT, toChecklistItemDto } from './checklist.mapper.js';

type Tx = Prisma.TransactionClient;

/**
 * Items of a checklist. Every write locks the card row first (see lockCardRow);
 * that one lock covers every checklist of the card, so moving an item between
 * two of them is safe too, and the counters sent with an event are the ones
 * that write left behind. Every query is scoped to the board.
 * Every write is broadcast to the board after its transaction committed.
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class ChecklistItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Adds an item at the end of the checklist. */
  async create(
    boardId: string,
    checklistId: string,
    input: CreateChecklistItemRequest,
    origin: EventOrigin,
  ): Promise<ChecklistItemDto> {
    const { item, cardId, counts, rebalanced } = await this.prisma.$transaction(async (tx) => {
      const found = await tx.checklist.findFirst({
        where: { id: checklistId, card: { boardId } },
        select: { cardId: true },
      });
      if (!found) throw checklistNotFound();
      if (!(await lockCardRow(tx, boardId, found.cardId))) throw checklistNotFound();
      // Re-check under the lock: the checklist may have been deleted while we waited.
      const stillThere = await tx.checklist.findFirst({
        where: { id: checklistId, cardId: found.cardId },
        select: { id: true },
      });
      if (!stillThere) throw checklistNotFound();

      const placement = await this.place(tx, checklistId, null, {});
      const created = await tx.checklistItem.create({
        data: { checklistId, content: input.content, position: placement.position },
        select: ITEM_SELECT,
      });
      return {
        item: toChecklistItemDto(created),
        cardId: found.cardId,
        counts: await countChecklistItems(tx, found.cardId),
        rebalanced: placement.rebalanced,
      };
    });
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'checklist-item', cardId, checklistId }, rebalanced),
      { type: 'checklist-item:created', data: { item, cardId, counts } },
    ]);
    return item;
  }

  /**
   * Edits the text or toggles completion. It changes no positions, but it takes the card
   * lock all the same: the counters in the event are counted under it, so writes of one
   * card are broadcast in the order they committed.
   */
  async update(
    boardId: string,
    itemId: string,
    input: UpdateChecklistItemRequest,
    origin: EventOrigin,
  ): Promise<ChecklistItemDto> {
    const { item, cardId, counts } = await this.prisma.$transaction(async (tx) => {
      const lockedCardId = await this.lockCardOf(tx, boardId, itemId);
      // Re-read under the lock: it may have been deleted while we waited.
      const current = await tx.checklistItem.findFirst({
        where: { id: itemId, checklist: { cardId: lockedCardId } },
        select: { id: true },
      });
      if (!current) throw checklistItemNotFound();

      const updated = await tx.checklistItem.update({
        where: { id: itemId },
        data: { content: input.content, isCompleted: input.isCompleted },
        select: ITEM_SELECT,
      });
      return {
        item: toChecklistItemDto(updated),
        cardId: lockedCardId,
        counts: await countChecklistItems(tx, lockedCardId),
      };
    });
    this.realtime.toBoard(boardId, origin, [
      { type: 'checklist-item:updated', data: { item, cardId, counts } },
    ]);
    return item;
  }

  /**
   * Moves the item within its checklist or to another checklist of the same
   * card. The card lock is taken before anything is read for placement.
   */
  async move(
    boardId: string,
    itemId: string,
    input: MoveChecklistItemRequest,
    origin: EventOrigin,
  ): Promise<MoveChecklistItemResponse> {
    const { cardId, fromChecklistId, moved, rebalanced } = await this.prisma.$transaction(
      async (tx) => {
        const lockedCardId = await this.lockCardOf(tx, boardId, itemId);
        // Re-read under the lock: it may have been deleted while we waited.
        const current = await tx.checklistItem.findFirst({
          where: { id: itemId, checklist: { cardId: lockedCardId } },
          select: { checklistId: true },
        });
        if (!current) throw checklistItemNotFound();

        const target = await tx.checklist.findFirst({
          where: { id: input.checklistId, cardId: lockedCardId },
          select: { id: true },
        });
        if (!target) throw invalidTarget('The target checklist is not on the same card');

        const placement = await this.place(tx, target.id, itemId, {
          afterId: input.afterItemId,
          beforeId: input.beforeItemId,
        });
        await tx.checklistItem.update({
          where: { id: itemId },
          data: { checklistId: target.id, position: placement.position },
        });
        const result: MoveChecklistItemResponse = {
          id: itemId,
          checklistId: target.id,
          position: placement.position,
        };
        return {
          cardId: lockedCardId,
          fromChecklistId: current.checklistId,
          moved: result,
          rebalanced: placement.rebalanced,
        };
      },
    );
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents(
        { entity: 'checklist-item', cardId, checklistId: moved.checklistId },
        rebalanced,
      ),
      {
        type: 'checklist-item:moved',
        data: {
          id: moved.id,
          cardId,
          fromChecklistId,
          toChecklistId: moved.checklistId,
          position: moved.position,
        },
      },
    ]);
    return moved;
  }

  async remove(boardId: string, itemId: string, origin: EventOrigin): Promise<void> {
    const { cardId, checklistId, counts } = await this.prisma.$transaction(async (tx) => {
      const lockedCardId = await this.lockCardOf(tx, boardId, itemId);
      const current = await tx.checklistItem.findFirst({
        where: { id: itemId, checklist: { cardId: lockedCardId } },
        select: { checklistId: true },
      });
      if (!current) throw checklistItemNotFound();
      await tx.checklistItem.delete({ where: { id: itemId } });
      return {
        cardId: lockedCardId,
        checklistId: current.checklistId,
        counts: await countChecklistItems(tx, lockedCardId),
      };
    });
    this.realtime.toBoard(boardId, origin, [
      { type: 'checklist-item:deleted', data: { id: itemId, checklistId, cardId, counts } },
    ]);
  }

  /** Finds the item's card, then locks it. 404 when either is gone. */
  private async lockCardOf(tx: Tx, boardId: string, itemId: string): Promise<string> {
    const found = await tx.checklistItem.findFirst({
      where: { id: itemId, checklist: { card: { boardId } } },
      select: { checklist: { select: { cardId: true } } },
    });
    if (!found) throw checklistItemNotFound();
    const { cardId } = found.checklist;
    if (!(await lockCardRow(tx, boardId, cardId))) throw checklistItemNotFound();
    return cardId;
  }

  /**
   * Position for `itemId` (null for a new item) among the items of the
   * checklist. Writes the new positions of the others when they had to be rebalanced.
   */
  private async place(
    tx: Tx,
    checklistId: string,
    itemId: string | null,
    anchors: Anchors,
  ): Promise<Placement> {
    const siblings = await tx.checklistItem.findMany({
      where: { checklistId, ...(itemId ? { id: { not: itemId } } : {}) },
      select: { id: true, position: true },
      orderBy: [...ITEM_ORDER],
    });
    return placeAndRebalance(siblings, anchors, (id, position) =>
      tx.checklistItem.update({ where: { id }, data: { position } }),
    );
  }
}
