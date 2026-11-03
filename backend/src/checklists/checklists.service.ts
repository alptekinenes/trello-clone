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
import { rebalanceEvents } from '../realtime/board-events.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { countChecklistItems } from './checklist-counts.js';
import { CHECKLIST_ORDER, CHECKLIST_SELECT, toChecklistDto } from './checklist.mapper.js';

type Tx = Prisma.TransactionClient;

/**
 * Checklists of a card. A write that changes positions or deletes a row locks
 * the card row first (see lockCardRow). Every query is scoped to the board.
 * Every write is broadcast to the board after its transaction committed.
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Adds a checklist at the end of the card. */
  async create(
    boardId: string,
    cardId: string,
    input: CreateChecklistRequest,
    origin: EventOrigin,
  ): Promise<ChecklistDto> {
    const { checklist, rebalanced } = await this.prisma.$transaction(async (tx) => {
      if (!(await lockCardRow(tx, boardId, cardId))) throw cardNotFound();

      const placement = await this.place(tx, cardId, null, {});
      const created = await tx.checklist.create({
        data: { cardId, title: input.title, position: placement.position },
        select: CHECKLIST_SELECT,
      });
      return { checklist: toChecklistDto(created), rebalanced: placement.rebalanced };
    });
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'checklist', cardId }, rebalanced),
      { type: 'checklist:created', data: checklist },
    ]);
    return checklist;
  }

  async rename(
    boardId: string,
    checklistId: string,
    input: UpdateChecklistRequest,
    origin: EventOrigin,
  ): Promise<ChecklistDto> {
    let checklist: ChecklistDto;
    try {
      const updated = await this.prisma.checklist.update({
        where: { id: checklistId, card: { boardId } },
        data: { title: input.title },
        select: CHECKLIST_SELECT,
      });
      checklist = toChecklistDto(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw checklistNotFound();
      }
      throw error;
    }
    // The items stay out of the event: a rename changes nothing about them.
    this.realtime.toBoard(boardId, origin, [
      {
        type: 'checklist:updated',
        data: { id: checklist.id, cardId: checklist.cardId, title: checklist.title },
      },
    ]);
    return checklist;
  }

  /** Moves the checklist within its card. Checklists cannot change cards. */
  async move(
    boardId: string,
    checklistId: string,
    input: ChecklistAnchors,
    origin: EventOrigin,
  ): Promise<MoveChecklistResponse> {
    const { cardId, moved, rebalanced } = await this.prisma.$transaction(async (tx) => {
      const lockedCardId = await this.lockCardOf(tx, boardId, checklistId);
      // Re-read under the lock: it may have been deleted while we waited.
      const current = await tx.checklist.findFirst({
        where: { id: checklistId, cardId: lockedCardId },
        select: { id: true },
      });
      if (!current) throw checklistNotFound();

      const placement = await this.place(tx, lockedCardId, checklistId, {
        afterId: input.afterChecklistId,
        beforeId: input.beforeChecklistId,
      });
      await tx.checklist.update({
        where: { id: checklistId },
        data: { position: placement.position },
      });
      const result: MoveChecklistResponse = { id: checklistId, position: placement.position };
      return { cardId: lockedCardId, moved: result, rebalanced: placement.rebalanced };
    });
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'checklist', cardId }, rebalanced),
      { type: 'checklist:moved', data: { id: moved.id, cardId, position: moved.position } },
    ]);
    return moved;
  }

  /** Deletes the checklist; its items go with it (cascade). */
  async remove(boardId: string, checklistId: string, origin: EventOrigin): Promise<void> {
    const { cardId, counts } = await this.prisma.$transaction(async (tx) => {
      const lockedCardId = await this.lockCardOf(tx, boardId, checklistId);
      const { count } = await tx.checklist.deleteMany({
        where: { id: checklistId, cardId: lockedCardId },
      });
      if (count === 0) throw checklistNotFound();
      return { cardId: lockedCardId, counts: await countChecklistItems(tx, lockedCardId) };
    });
    this.realtime.toBoard(boardId, origin, [
      { type: 'checklist:deleted', data: { id: checklistId, cardId, counts } },
    ]);
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
