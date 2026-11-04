import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ErrorCode, POSITION_GAP } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { ListsService } from './lists.service.js';

const BOARD = 'board-1';
const ORIGIN: EventOrigin = { actorId: 'user-1', socketId: 'socket-1' };
const ARCHIVED_AT = new Date('2026-10-27T10:00:00.000Z');

function row(id: string, position: number, archivedAt: Date | null = null) {
  return { id, boardId: BOARD, title: id.toUpperCase(), position, archivedAt };
}

/** Fake Prisma whose $transaction runs the callback with the same fake as `tx`. */
function setup({
  boardExists = true,
  current = { archivedAt: null as Date | null } as { archivedAt: Date | null } | null,
  siblings = [
    { id: 'a', position: 1024 },
    { id: 'b', position: 2048 },
  ],
} = {}) {
  const list = {
    findFirst: vi.fn().mockResolvedValue(current),
    findMany: vi.fn().mockResolvedValue(siblings),
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve(row('new', data.position))),
    update: vi
      .fn()
      .mockImplementation(({ where, data }) =>
        Promise.resolve(row(where.id, data.position ?? 0, data.archivedAt ?? null)),
      ),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = {
    list,
    $queryRaw: vi.fn().mockResolvedValue(boardExists ? [{ id: BOARD }] : []),
  };
  const realtime = { toBoard: vi.fn() };
  // How many broadcasts had been made when the transaction callback returned.
  const inTransaction = { broadcasts: -1 };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => {
      const result = await fn(tx);
      inTransaction.broadcasts = realtime.toBoard.mock.calls.length;
      return result;
    }),
  };
  const service = new ListsService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
  );
  return { service, realtime, inTransaction, list, tx };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

describe('ListsService', () => {
  describe('create', () => {
    it('locks the board and appends after the last list', async () => {
      const { service, list, tx } = setup();

      const result = await service.create(BOARD, { title: 'C' }, ORIGIN);

      expect(tx.$queryRaw).toHaveBeenCalledOnce();
      expect(list.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { boardId: BOARD, title: 'C', position: 2048 + POSITION_GAP } }),
      );
      expect(result.position).toBe(2048 + POSITION_GAP);
    });

    it('turns a stale anchor into 409 POSITION_CONFLICT', async () => {
      const { service, list } = setup();

      const error = await service
        .create(BOARD, { title: 'C', afterListId: 'gone' }, ORIGIN)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe(ErrorCode.POSITION_CONFLICT);
      expect(list.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the board was deleted meanwhile', async () => {
      const { service } = setup({ boardExists: false });
      await expect(service.create(BOARD, { title: 'C' }, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('writes rebalanced positions before creating', async () => {
      const { service, list } = setup({
        siblings: [
          { id: 'a', position: 1 },
          { id: 'b', position: 1 + 1e-7 },
        ],
      });

      await service.create(BOARD, { title: 'C', afterListId: 'a' }, ORIGIN);

      expect(list.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { position: 1024 } });
      expect(list.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { position: 3072 } });
      expect(list.create.mock.calls[0][0].data.position).toBe(2048);
    });
  });

  describe('move', () => {
    it('excludes the moved list from its own siblings', async () => {
      const { service, list } = setup();

      await service.move(BOARD, 'b', { beforeListId: 'a' }, ORIGIN);

      expect(list.findMany.mock.calls[0][0].where).toEqual({
        boardId: BOARD,
        archivedAt: null,
        id: { not: 'b' },
      });
      expect(list.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { position: 512 } });
    });

    it('returns the new position and no rebalance when the gap was enough', async () => {
      const { service } = setup();

      const result = await service.move(BOARD, 'b', { beforeListId: 'a' }, ORIGIN);

      expect(result).toEqual({ id: 'b', position: 512, rebalanced: null });
    });

    it('returns the rebalanced positions of the other lists', async () => {
      const { service } = setup({
        siblings: [
          { id: 'a', position: 1 },
          { id: 'b', position: 1 + 1e-7 },
        ],
      });

      const result = await service.move(BOARD, 'c', { afterListId: 'a' }, ORIGIN);

      expect(result).toEqual({
        id: 'c',
        position: 2048,
        rebalanced: {
          entity: 'list',
          positions: [
            { id: 'a', position: 1024 },
            { id: 'b', position: 3072 },
          ],
        },
      });
    });

    it('refuses archived lists with 400 INVALID_TARGET', async () => {
      const { service } = setup({ current: { archivedAt: ARCHIVED_AT } });

      const error = await service.move(BOARD, 'a', {}, ORIGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_TARGET);
    });

    it('throws 404 for a list that is not on the board', async () => {
      const { service } = setup({ current: null });
      await expect(service.move(BOARD, 'x', {}, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('archives without touching the position', async () => {
      const { service, list } = setup();

      await service.update(BOARD, 'a', { archived: true }, ORIGIN);

      const { data } = list.update.mock.calls[0][0];
      expect(data.archivedAt).toBeInstanceOf(Date);
      expect(data.position).toBeUndefined();
    });

    it('keeps the first archive date when archiving twice', async () => {
      const { service, list } = setup({ current: { archivedAt: ARCHIVED_AT } });

      await service.update(BOARD, 'a', { archived: true }, ORIGIN);

      expect(list.update.mock.calls[0][0].data.archivedAt).toBeUndefined();
    });

    it('restores an archived list to the end', async () => {
      const { service, list } = setup({ current: { archivedAt: ARCHIVED_AT } });

      await service.update(BOARD, 'c', { archived: false }, ORIGIN);

      expect(list.update.mock.calls[0][0].data).toEqual({
        title: undefined,
        archivedAt: null,
        position: 2048 + POSITION_GAP,
      });
    });
  });

  describe('realtime', () => {
    it('broadcasts list:created once, after the transaction', async () => {
      const { service, realtime, inTransaction } = setup();

      const list = await service.create(BOARD, { title: 'C' }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'list:created', data: list },
      ]);
    });

    it('puts position:rebalanced in front of the event that caused it', async () => {
      const { service, realtime } = setup({
        siblings: [
          { id: 'a', position: 1 },
          { id: 'b', position: 1 + 1e-7 },
        ],
      });

      await service.create(BOARD, { title: 'C', afterListId: 'a' }, ORIGIN);

      const events = realtime.toBoard.mock.calls[0][2];
      expect(events.map((event: { type: string }) => event.type)).toEqual([
        'position:rebalanced',
        'list:created',
      ]);
      expect(events[0].data).toEqual({
        entity: 'list',
        positions: [
          { id: 'a', position: 1024 },
          { id: 'b', position: 3072 },
        ],
      });
    });

    it('broadcasts list:updated for a rename and for an archive', async () => {
      const { service, realtime, inTransaction } = setup();

      const renamed = await service.update(BOARD, 'a', { title: 'Yeni' }, ORIGIN);
      const archived = await service.update(BOARD, 'a', { archived: true }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(1);
      expect(realtime.toBoard.mock.calls.map(([, , events]) => events)).toEqual([
        [{ type: 'list:updated', data: renamed }],
        [{ type: 'list:updated', data: archived }],
      ]);
    });

    it('broadcasts list:updated with the new position for a restore', async () => {
      const { service, realtime } = setup({ current: { archivedAt: ARCHIVED_AT } });

      const restored = await service.update(BOARD, 'c', { archived: false }, ORIGIN);

      expect(restored.position).toBe(2048 + POSITION_GAP);
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'list:updated', data: restored },
      ]);
    });

    it('broadcasts list:moved with the id and position only', async () => {
      const { service, realtime, inTransaction } = setup();

      await service.move(BOARD, 'b', { beforeListId: 'a' }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'list:moved', data: { id: 'b', position: 512 } },
      ]);
    });

    it('broadcasts rebalanced siblings before list:moved', async () => {
      const { service, realtime } = setup({
        siblings: [
          { id: 'a', position: 1 },
          { id: 'b', position: 1 + 1e-7 },
        ],
      });

      const result = await service.move(BOARD, 'c', { afterListId: 'a' }, ORIGIN);

      const events = realtime.toBoard.mock.calls[0][2];
      expect(events.map((event: { type: string }) => event.type)).toEqual([
        'position:rebalanced',
        'list:moved',
      ]);
      expect(result.rebalanced).toEqual(events[0].data);
    });

    it('broadcasts list:deleted after the delete', async () => {
      const { service, realtime, list } = setup();

      await service.remove(BOARD, 'a', ORIGIN);

      expect(list.deleteMany).toHaveBeenCalledWith({ where: { id: 'a', boardId: BOARD } });
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'list:deleted', data: { id: 'a' } },
      ]);
    });

    it('answers 404 and broadcasts nothing when no list was deleted', async () => {
      const { service, realtime, list } = setup();
      list.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(BOARD, 'a', ORIGIN)).rejects.toBeInstanceOf(NotFoundException);

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it.each([
      ['create', (service: ListsService) => service.create(BOARD, { title: 'C', afterListId: 'gone' }, ORIGIN)],
      ['update', (service: ListsService) => service.update(BOARD, 'x', { title: 'Y' }, ORIGIN)],
      ['move', (service: ListsService) => service.move(BOARD, 'x', {}, ORIGIN)],
    ])('broadcasts nothing when %s fails', async (_name, run) => {
      const { service, realtime, list } = setup({ current: null });
      list.findMany.mockResolvedValue([]);

      await expect(run(service)).rejects.toBeInstanceOf(Error);

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });
  });
});
