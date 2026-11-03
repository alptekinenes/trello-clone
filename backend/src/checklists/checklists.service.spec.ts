import { ConflictException, NotFoundException } from '@nestjs/common';
import { ErrorCode, POSITION_GAP } from '@trello/contracts';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { ChecklistsService } from './checklists.service.js';

const BOARD = 'board-1';
const ORIGIN: EventOrigin = { actorId: 'user-1', socketId: 'socket-1' };
const CARD = 'card-1';

function checklistRow(id: string, position: number) {
  return { id, cardId: CARD, title: id.toUpperCase(), position, items: [] };
}

/**
 * Fake Prisma whose $transaction runs the callback with the same fake as `tx`.
 * `calls` records the order of the lock query and the writes.
 */
function setup({
  lock = [{ id: CARD }] as { id: string }[],
  found = { cardId: CARD } as { cardId: string } | null,
  current = { id: 'c' } as { id: string } | null,
  siblings = [
    { id: 'a', position: 1024 },
    { id: 'b', position: 2048 },
  ],
  deleted = 1,
  counts = { total: 5, done: 2 },
} = {}) {
  const calls: string[] = [];
  const checklist = {
    findFirst: vi.fn().mockImplementation((args: { select: object }) => {
      calls.push('findFirst');
      return Promise.resolve('cardId' in args.select ? found : current);
    }),
    findMany: vi.fn().mockImplementation(() => {
      calls.push('findMany');
      return Promise.resolve(siblings);
    }),
    create: vi.fn().mockImplementation(({ data }) => {
      calls.push('create');
      return Promise.resolve(checklistRow('new', data.position));
    }),
    update: vi.fn().mockImplementation(({ where, data }) => {
      calls.push('update');
      return Promise.resolve(checklistRow(where.id, data.position ?? 0));
    }),
    deleteMany: vi.fn().mockImplementation(() => {
      calls.push('deleteMany');
      return Promise.resolve({ count: deleted });
    }),
  };
  const checklistItem = {
    count: vi.fn().mockImplementation((args: { where: { isCompleted?: boolean } }) => {
      calls.push('count');
      return Promise.resolve(args.where.isCompleted ? counts.done : counts.total);
    }),
  };
  const tx = {
    checklist,
    checklistItem,
    $queryRaw: vi.fn().mockImplementation(() => {
      calls.push('lock');
      return Promise.resolve(lock);
    }),
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
  const service = new ChecklistsService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
  );
  return { service, realtime, inTransaction, checklist, tx, calls, prisma };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

describe('ChecklistsService', () => {
  describe('create', () => {
    it('locks the card first and appends after the last checklist', async () => {
      const { service, checklist, calls } = setup();

      const result = await service.create(BOARD, CARD, { title: 'Yapılacaklar' }, ORIGIN);

      expect(calls[0]).toBe('lock');
      expect(checklist.findMany.mock.calls[0][0].where).toEqual({ cardId: CARD });
      expect(checklist.create.mock.calls[0][0].data).toEqual({
        cardId: CARD,
        title: 'Yapılacaklar',
        position: 2048 + POSITION_GAP,
      });
      expect(result).toMatchObject({ id: 'new', cardId: CARD, items: [] });
    });

    it('throws 404 when the lock finds no card', async () => {
      const { service, checklist } = setup({ lock: [] });

      await expect(service.create(BOARD, CARD, { title: 'X' }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(checklist.create).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('updates only inside the board and returns the checklist', async () => {
      const { service, checklist, tx } = setup();

      await service.rename(BOARD, 'c', { title: 'Yeni' }, ORIGIN);

      expect(checklist.update.mock.calls[0][0].where).toEqual({
        id: 'c',
        card: { boardId: BOARD },
      });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('turns P2025 into 404 Checklist not found', async () => {
      const { service, checklist } = setup();
      checklist.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
      );

      const error = await service.rename(BOARD, 'c', { title: 'Y' }, ORIGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('Checklist not found');
    });
  });

  describe('move', () => {
    it('locks before reading siblings and places between the anchors', async () => {
      const { service, checklist, calls } = setup();

      const result = await service.move(BOARD, 'c', { afterChecklistId: 'a', beforeChecklistId: 'b' }, ORIGIN);

      expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('findMany'));
      expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('update'));
      expect(checklist.findMany.mock.calls[0][0].where).toEqual({
        cardId: CARD,
        id: { not: 'c' },
      });
      expect(result).toEqual({ id: 'c', position: 1536 });
      expect(checklist.update).toHaveBeenCalledWith({
        where: { id: 'c' },
        data: { position: 1536 },
      });
    });

    it('throws 404 when the checklist is gone before the lock', async () => {
      const { service, tx } = setup({ found: null });
      await expect(service.move(BOARD, 'c', {}, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('throws 404 when the card is gone at the lock', async () => {
      const { service } = setup({ lock: [] });
      await expect(service.move(BOARD, 'c', {}, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the checklist was deleted while waiting for the lock', async () => {
      const { service, checklist } = setup({ current: null });

      await expect(service.move(BOARD, 'c', {}, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
      expect(checklist.update).not.toHaveBeenCalled();
    });

    it('turns a stale anchor into 409 POSITION_CONFLICT', async () => {
      const { service, checklist } = setup();

      const error = await service
        .move(BOARD, 'c', { afterChecklistId: 'gone' }, ORIGIN)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe(ErrorCode.POSITION_CONFLICT);
      expect(checklist.update).not.toHaveBeenCalled();
    });

    it('rebalances the siblings when the gap ran out', async () => {
      const { service, checklist } = setup({
        siblings: [
          { id: 'a', position: 1024 },
          { id: 'b', position: 1024 + 1e-7 },
        ],
      });

      const result = await service.move(BOARD, 'c', { afterChecklistId: 'a' }, ORIGIN);

      const writes = checklist.update.mock.calls.map(
        ([args]) => [args.where.id, args.data.position] as const,
      );
      expect(writes.slice(0, 2)).toEqual([
        ['a', POSITION_GAP],
        ['b', 3 * POSITION_GAP],
      ]);
      expect(result.position).toBe(2 * POSITION_GAP);
    });
  });

  describe('remove', () => {
    it('locks the card before deleting', async () => {
      const { service, checklist, calls } = setup();

      await service.remove(BOARD, 'c', ORIGIN);

      expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('deleteMany'));
      expect(checklist.deleteMany).toHaveBeenCalledWith({ where: { id: 'c', cardId: CARD } });
    });

    it('throws 404 when nothing was deleted', async () => {
      const { service } = setup({ deleted: 0 });
      await expect(service.remove(BOARD, 'c', ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the checklist is not on the board', async () => {
      const { service, tx } = setup({ found: null });
      await expect(service.remove(BOARD, 'c', ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('realtime', () => {
    function types(realtime: { toBoard: ReturnType<typeof vi.fn> }, call = 0): string[] {
      return realtime.toBoard.mock.calls[call][2].map((event: { type: string }) => event.type);
    }

    it('broadcasts checklist:created once, after the transaction', async () => {
      const { service, realtime, inTransaction } = setup();

      const created = await service.create(BOARD, CARD, { title: 'Liste' }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'checklist:created', data: created },
      ]);
    });

    it('broadcasts nothing when create fails', async () => {
      const { service, realtime } = setup({ lock: [] });

      await expect(service.create(BOARD, CARD, { title: 'X' }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts nothing when the transaction rejects', async () => {
      const { service, realtime, prisma } = setup();
      prisma.$transaction.mockRejectedValueOnce(new Error('deadlock'));

      await expect(service.remove(BOARD, 'c', ORIGIN)).rejects.toThrow('deadlock');

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts checklist:updated with the title only', async () => {
      const { service, realtime } = setup();

      await service.rename(BOARD, 'c', { title: 'Yeni' }, ORIGIN);

      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'checklist:updated', data: { id: 'c', cardId: CARD, title: 'C' } },
      ]);
    });

    it('broadcasts nothing when the rename finds no checklist', async () => {
      const { service, realtime, checklist } = setup();
      checklist.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
      );

      await expect(service.rename(BOARD, 'c', { title: 'Y' }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts checklist:moved with the card and the new position', async () => {
      const { service, realtime, inTransaction } = setup();

      await service.move(BOARD, 'c', { afterChecklistId: 'a', beforeChecklistId: 'b' }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'checklist:moved', data: { id: 'c', cardId: CARD, position: 1536 } },
      ]);
    });

    it('puts position:rebalanced of the card in front of checklist:moved', async () => {
      const { service, realtime } = setup({
        siblings: [
          { id: 'a', position: 1024 },
          { id: 'b', position: 1024 + 1e-7 },
        ],
      });

      await service.move(BOARD, 'c', { afterChecklistId: 'a' }, ORIGIN);

      expect(types(realtime)).toEqual(['position:rebalanced', 'checklist:moved']);
      expect(realtime.toBoard.mock.calls[0][2][0].data).toEqual({
        entity: 'checklist',
        cardId: CARD,
        positions: [
          { id: 'a', position: POSITION_GAP },
          { id: 'b', position: 3 * POSITION_GAP },
        ],
      });
    });

    it('broadcasts nothing when a move hits a stale anchor', async () => {
      const { service, realtime } = setup();

      await expect(
        service.move(BOARD, 'c', { afterChecklistId: 'gone' }, ORIGIN),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts checklist:deleted with the counters counted after the delete', async () => {
      const { service, realtime, calls, inTransaction } = setup({ counts: { total: 3, done: 1 } });

      await service.remove(BOARD, 'c', ORIGIN);

      expect(calls.indexOf('deleteMany')).toBeLessThan(calls.indexOf('count'));
      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        {
          type: 'checklist:deleted',
          data: { id: 'c', cardId: CARD, counts: { checklistTotal: 3, checklistDone: 1 } },
        },
      ]);
    });

    it('broadcasts nothing when the delete matched no checklist', async () => {
      const { service, realtime } = setup({ deleted: 0 });

      await expect(service.remove(BOARD, 'c', ORIGIN)).rejects.toBeInstanceOf(NotFoundException);

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });
  });
});
