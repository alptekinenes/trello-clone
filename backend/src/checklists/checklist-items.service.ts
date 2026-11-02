import { Injectable } from '@nestjs/common';
import type {
  ChecklistItemDto,
  CreateChecklistItemRequest,
  MoveChecklistItemRequest,
  MoveChecklistItemResponse,
  UpdateChecklistItemRequest,
} from '@trello/contracts';
import { checklistItemNotFound, checklistNotFound } from '../access/access.errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { lockCardRow } from '../ordering/locks.js';
import { invalidTarget } from '../ordering/ordering.errors.js';
import { placeAndRebalance } from '../ordering/place-and-rebalance.js';
import type { Anchors } from '../ordering/placement.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ITEM_ORDER, ITEM_SELECT, toChecklistItemDto } from './checklist.mapper.js';

type Tx = Prisma.TransactionClient;

/**
 * Items of a checklist. Writes that change positions or delete rows lock the
 * card row first (see lockCardRow); that one lock covers every checklist of the
 * card, so moving an item between two of them is safe too. Every query is
 * scoped to the board. Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class ChecklistItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Adds an item at the end of the checklist. */
  create(
    boardId: string,
    checklistId: string,
    input: CreateChecklistItemRequest,
  ): Promise<ChecklistItemDto> {
    return this.prisma.$transaction(async (tx) => {
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

      const position = await this.place(tx, checklistId, null, {});
      const item = await tx.checklistItem.create({
        data: { checklistId, content: input.content, position },
        select: ITEM_SELECT,
      });
      return toChecklistItemDto(item);
    });
  }

  /** Edits the text or toggles completion. Changes no positions, so it takes no lock. */
  async update(
    boardId: string,
    itemId: string,
    input: UpdateChecklistItemRequest,
  ): Promise<ChecklistItemDto> {
    try {
      const item = await this.prisma.checklistItem.update({
        where: { id: itemId, checklist: { card: { boardId } } },
        data: { content: input.content, isCompleted: input.isCompleted },
        select: ITEM_SELECT,
      });
      return toChecklistItemDto(item);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw checklistItemNotFound();
      }
      throw error;
    }
  }

  /**
   * Moves the item within its checklist or to another checklist of the same
   * card. The card lock is taken before anything is read for placement.
   */
  move(
    boardId: string,
    itemId: string,
    input: MoveChecklistItemRequest,
  ): Promise<MoveChecklistItemResponse> {
    return this.prisma.$transaction(async (tx) => {
      const cardId = await this.lockCardOf(tx, boardId, itemId);
      // Re-read under the lock: it may have been deleted while we waited.
      const current = await tx.checklistItem.findFirst({
        where: { id: itemId, checklist: { cardId } },
        select: { id: true },
      });
      if (!current) throw checklistItemNotFound();

      const target = await tx.checklist.findFirst({
        where: { id: input.checklistId, cardId },
        select: { id: true },
      });
      if (!target) throw invalidTarget('The target checklist is not on the same card');

      const position = await this.place(tx, target.id, itemId, {
        afterId: input.afterItemId,
        beforeId: input.beforeItemId,
      });
      await tx.checklistItem.update({
        where: { id: itemId },
        data: { checklistId: target.id, position },
      });
      return { id: itemId, checklistId: target.id, position };
    });
  }

  remove(boardId: string, itemId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const cardId = await this.lockCardOf(tx, boardId, itemId);
      const { count } = await tx.checklistItem.deleteMany({
        where: { id: itemId, checklist: { cardId } },
      });
      if (count === 0) throw checklistItemNotFound();
    });
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
  ): Promise<number> {
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
