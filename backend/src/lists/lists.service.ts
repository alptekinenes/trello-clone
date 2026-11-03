import { Injectable } from '@nestjs/common';
import type {
  CreateListRequest,
  ListDto,
  MoveListRequest,
  MoveListResponse,
  UpdateListRequest,
} from '@trello/contracts';
import { boardNotFound, listNotFound } from '../access/access.errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { lockBoard } from '../ordering/locks.js';
import { invalidTarget } from '../ordering/ordering.errors.js';
import { placeAndRebalance } from '../ordering/place-and-rebalance.js';
import type { Anchors, Placement, Sibling } from '../ordering/placement.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { rebalanceEvents } from '../realtime/board-events.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { LIST_ORDER, LIST_SELECT, toListDto } from './list.mapper.js';

type Tx = Prisma.TransactionClient;

/** What a list write returns from its transaction: the result and the siblings that were respread. */
interface Written<T> {
  result: T;
  rebalanced: Sibling[] | null;
}

/**
 * List CRUD and ordering. Every write that touches positions locks the board
 * row first, so concurrent moves on one board cannot interleave.
 * Every write is broadcast to the board after its transaction committed.
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async listForBoard(boardId: string, archived: boolean): Promise<ListDto[]> {
    const lists = await this.prisma.list.findMany({
      where: { boardId, archivedAt: archived ? { not: null } : null },
      select: LIST_SELECT,
      orderBy: archived ? [{ archivedAt: 'desc' }, { id: 'asc' }] : [...LIST_ORDER],
    });
    return lists.map(toListDto);
  }

  async create(boardId: string, input: CreateListRequest, origin: EventOrigin): Promise<ListDto> {
    const { result: list, rebalanced } = await this.prisma.$transaction(
      async (tx): Promise<Written<ListDto>> => {
        await this.lock(tx, boardId);
        const placement = await this.place(tx, boardId, null, {
          afterId: input.afterListId,
          beforeId: input.beforeListId,
        });
        const created = await tx.list.create({
          data: { boardId, title: input.title, position: placement.position },
          select: LIST_SELECT,
        });
        return { result: toListDto(created), rebalanced: placement.rebalanced };
      },
    );
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'list' }, rebalanced),
      { type: 'list:created', data: list },
    ]);
    return list;
  }

  /** Renames, archives, or restores the list (a restored list goes to the end). */
  async update(
    boardId: string,
    listId: string,
    input: UpdateListRequest,
    origin: EventOrigin,
  ): Promise<ListDto> {
    const { result: list, rebalanced } = await this.prisma.$transaction(
      async (tx): Promise<Written<ListDto>> => {
        await this.lock(tx, boardId);
        const current = await this.findOnBoard(tx, boardId, listId);

        const data: Prisma.ListUpdateInput = { title: input.title };
        let rebalancedSiblings: Sibling[] | null = null;
        if (input.archived === true && !current.archivedAt) {
          data.archivedAt = new Date();
        }
        if (input.archived === false && current.archivedAt) {
          data.archivedAt = null;
          const placement = await this.place(tx, boardId, listId, {});
          data.position = placement.position;
          rebalancedSiblings = placement.rebalanced;
        }

        const updated = await tx.list.update({ where: { id: listId }, data, select: LIST_SELECT });
        return { result: toListDto(updated), rebalanced: rebalancedSiblings };
      },
    );
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'list' }, rebalanced),
      { type: 'list:updated', data: list },
    ]);
    return list;
  }

  async move(
    boardId: string,
    listId: string,
    anchors: MoveListRequest,
    origin: EventOrigin,
  ): Promise<MoveListResponse> {
    const { result: moved, rebalanced } = await this.prisma.$transaction(
      async (tx): Promise<Written<MoveListResponse>> => {
        await this.lock(tx, boardId);
        const current = await this.findOnBoard(tx, boardId, listId);
        if (current.archivedAt) throw invalidTarget('Archived lists cannot be moved');

        const { position, rebalanced: respread } = await this.place(tx, boardId, listId, {
          afterId: anchors.afterListId,
          beforeId: anchors.beforeListId,
        });
        await tx.list.update({ where: { id: listId }, data: { position } });
        return { result: { id: listId, position }, rebalanced: respread };
      },
    );
    this.realtime.toBoard(boardId, origin, [
      ...rebalanceEvents({ entity: 'list' }, rebalanced),
      { type: 'list:moved', data: moved },
    ]);
    return moved;
  }

  /** Cards on the list go with it (cascade). */
  async remove(boardId: string, listId: string, origin: EventOrigin): Promise<void> {
    const { count } = await this.prisma.list.deleteMany({ where: { id: listId, boardId } });
    if (count === 0) throw listNotFound();
    this.realtime.toBoard(boardId, origin, [{ type: 'list:deleted', data: { id: listId } }]);
  }

  private async lock(tx: Tx, boardId: string): Promise<void> {
    if (!(await lockBoard(tx, boardId))) throw boardNotFound();
  }

  private async findOnBoard(tx: Tx, boardId: string, listId: string) {
    const list = await tx.list.findFirst({
      where: { id: listId, boardId },
      select: { archivedAt: true },
    });
    if (!list) throw listNotFound();
    return list;
  }

  /**
   * Position for `listId` (null for a new list) among the board's active lists.
   * Writes the new positions of the other lists when they had to be rebalanced.
   */
  private async place(
    tx: Tx,
    boardId: string,
    listId: string | null,
    anchors: Anchors,
  ): Promise<Placement> {
    const siblings = await tx.list.findMany({
      where: { boardId, archivedAt: null, ...(listId ? { id: { not: listId } } : {}) },
      select: { id: true, position: true },
      orderBy: [...LIST_ORDER],
    });
    return placeAndRebalance(siblings, anchors, (id, position) =>
      tx.list.update({ where: { id }, data: { position } }),
    );
  }
}
