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
import type { Anchors } from '../ordering/placement.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LIST_ORDER, LIST_SELECT, toListDto } from './list.mapper.js';

type Tx = Prisma.TransactionClient;

/**
 * List CRUD and ordering. Every write that touches positions locks the board
 * row first, so concurrent moves on one board cannot interleave.
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class ListsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBoard(boardId: string, archived: boolean): Promise<ListDto[]> {
    const lists = await this.prisma.list.findMany({
      where: { boardId, archivedAt: archived ? { not: null } : null },
      select: LIST_SELECT,
      orderBy: archived ? [{ archivedAt: 'desc' }, { id: 'asc' }] : [...LIST_ORDER],
    });
    return lists.map(toListDto);
  }

  create(boardId: string, input: CreateListRequest): Promise<ListDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, boardId);
      const position = await this.place(tx, boardId, null, {
        afterId: input.afterListId,
        beforeId: input.beforeListId,
      });
      const list = await tx.list.create({
        data: { boardId, title: input.title, position },
        select: LIST_SELECT,
      });
      return toListDto(list);
    });
  }

  /** Renames, archives, or restores the list (a restored list goes to the end). */
  update(boardId: string, listId: string, input: UpdateListRequest): Promise<ListDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, boardId);
      const current = await this.findOnBoard(tx, boardId, listId);

      const data: Prisma.ListUpdateInput = { title: input.title };
      if (input.archived === true && !current.archivedAt) {
        data.archivedAt = new Date();
      }
      if (input.archived === false && current.archivedAt) {
        data.archivedAt = null;
        data.position = await this.place(tx, boardId, listId, {});
      }

      const list = await tx.list.update({ where: { id: listId }, data, select: LIST_SELECT });
      return toListDto(list);
    });
  }

  move(boardId: string, listId: string, anchors: MoveListRequest): Promise<MoveListResponse> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, boardId);
      const current = await this.findOnBoard(tx, boardId, listId);
      if (current.archivedAt) throw invalidTarget('Archived lists cannot be moved');

      const position = await this.place(tx, boardId, listId, {
        afterId: anchors.afterListId,
        beforeId: anchors.beforeListId,
      });
      await tx.list.update({ where: { id: listId }, data: { position } });
      return { id: listId, position };
    });
  }

  /** Cards on the list go with it (cascade). */
  async remove(listId: string): Promise<void> {
    await this.prisma.list.delete({ where: { id: listId } });
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
  ): Promise<number> {
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
