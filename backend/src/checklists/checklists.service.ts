import { Injectable } from '@nestjs/common';
import type {
  ChecklistAnchors,
  ChecklistDto,
  CreateChecklistRequest,
  MoveChecklistResponse,
  UpdateChecklistRequest,
} from '@trello/contracts';
import { cardNotFound, checklistNotFound } from '../access/access.errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { lockCardRow } from '../ordering/locks.js';
import { placeAndRebalance } from '../ordering/place-and-rebalance.js';
import type { Placement } from '../ordering/placement.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CHECKLIST_ORDER,
  CHECKLIST_SELECT,
  toChecklistDto,
} from './checklist.mapper.js';

type Tx = Prisma.TransactionClient;

/**
 * Checklists of a card. A write that changes positions or deletes a row locks
 * the card row first (see lockCardRow). Every query is scoped to the board.
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Adds a checklist at the end of the card. */
  create(boardId: string, cardId: string, input: CreateChecklistRequest): Promise<ChecklistDto> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await lockCardRow(tx, boardId, cardId))) throw cardNotFound();

      const { position } = await this.place(tx, cardId, null, {});
      const checklist = await tx.checklist.create({
        data: { cardId, title: input.title, position },
        select: CHECKLIST_SELECT,
      });
      return toChecklistDto(checklist);
    });
  }

  async rename(
    boardId: string,
    checklistId: string,
    input: UpdateChecklistRequest,
  ): Promise<ChecklistDto> {
    try {
      const checklist = await this.prisma.checklist.update({
        where: { id: checklistId, card: { boardId } },
        data: { title: input.title },
        select: CHECKLIST_SELECT,
      });
      return toChecklistDto(checklist);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw checklistNotFound();
      }
      throw error;
    }
  }

  /** Moves the checklist within its card. Checklists cannot change cards. */
  move(
    boardId: string,
    checklistId: string,
    input: ChecklistAnchors,
  ): Promise<MoveChecklistResponse> {
    return this.prisma.$transaction(async (tx) => {
      const cardId = await this.lockCardOf(tx, boardId, checklistId);
      // Re-read under the lock: it may have been deleted while we waited.
      const current = await tx.checklist.findFirst({
        where: { id: checklistId, cardId },
        select: { id: true },
      });
      if (!current) throw checklistNotFound();

      const { position } = await this.place(tx, cardId, checklistId, {
        afterId: input.afterChecklistId,
        beforeId: input.beforeChecklistId,
      });
      await tx.checklist.update({ where: { id: checklistId }, data: { position } });
      return { id: checklistId, position };
    });
  }

  /** Deletes the checklist; its items go with it (cascade). */
  remove(boardId: string, checklistId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const cardId = await this.lockCardOf(tx, boardId, checklistId);
      const { count } = await tx.checklist.deleteMany({ where: { id: checklistId, cardId } });
      if (count === 0) throw checklistNotFound();
    });
  }

  /** Finds the checklist's card, then locks it. 404 when either is gone. */
  private async lockCardOf(tx: Tx, boardId: string, checklistId: string): Promise<string> {
    const found = await tx.checklist.findFirst({
      where: { id: checklistId, card: { boardId } },
      select: { cardId: true },
    });
    if (!found) throw checklistNotFound();
    if (!(await lockCardRow(tx, boardId, found.cardId))) throw checklistNotFound();
    return found.cardId;
  }

  /**
   * Position for `checklistId` (null for a new checklist) among the card's
   * checklists. Writes the new positions of the others when they had to be rebalanced.
   */
  private async place(
    tx: Tx,
    cardId: string,
    checklistId: string | null,
    anchors: { afterId?: string | null; beforeId?: string | null },
  ): Promise<Placement> {
    const siblings = await tx.checklist.findMany({
      where: { cardId, ...(checklistId ? { id: { not: checklistId } } : {}) },
      select: { id: true, position: true },
      orderBy: [...CHECKLIST_ORDER],
    });
    return placeAndRebalance(siblings, anchors, (id, position) =>
      tx.checklist.update({ where: { id }, data: { position } }),
    );
  }
}
