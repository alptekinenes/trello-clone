import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ErrorCode, POSITION_GAP } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { ChecklistItemsService } from './checklist-items.service.js';

const BOARD = 'board-1';
const ORIGIN: EventOrigin = { actorId: 'user-1', socketId: 'socket-1' };
const CARD = 'card-1';
const LIST_A = 'cl-a';
const LIST_B = 'cl-b';

function itemRow(id: string, checklistId: string, position: number) {
  return { id, checklistId, content: id.toUpperCase(), isCompleted: false, position };
}

/**
 * Fake Prisma whose $transaction runs the callback with the same fake as `tx`.
 * `calls` records the order of the lock query and the reads and writes.
 */
function setup({
  lock = [{ id: CARD }] as { id: string }[],
  itemCard = { checklist: { cardId: CARD } } as { checklist: { cardId: string } } | null,
  currentItem = { id: 'x', checklistId: LIST_A } as { id: string; checklistId: string } | null,
  checklist = { id: LIST_B } as { id: string } | null,
  siblings = [
    { id: 'a', position: 1024 },
    { id: 'b', position: 2048 },
  ],
  counts = { total: 5, done: 2 },
  // Successive checklist.findFirst results; once used up, `checklist` is returned.
  checklistReads = [] as ({ id?: string; cardId?: string } | null)[],
} = {}) {
  const calls: string[] = [];
  const checklistItem = {
    findFirst: vi.fn().mockImplementation((args: { select: object }) => {
      calls.push('item.findFirst');
      return Promise.resolve('checklist' in args.select ? itemCard : currentItem);
    }),
    findMany: vi.fn().mockImplementation(() => {
      calls.push('item.findMany');
      return Promise.resolve(siblings);
    }),
    create: vi.fn().mockImplementation(({ data }) => {
      calls.push('item.create');
      return Promise.resolve(itemRow('new', data.checklistId, data.position));
    }),
    update: vi.fn().mockImplementation(({ where, data }) => {
      calls.push('item.update');
      return Promise.resolve(itemRow(where.id, data.checklistId ?? LIST_A, data.position ?? 0));
    }),
    delete: vi.fn().mockImplementation(() => {
      calls.push('item.delete');
      return Promise.resolve({});
    }),
    count: vi.fn().mockImplementation((args: { where: { isCompleted?: boolean } }) => {
      calls.push('count');
      return Promise.resolve(args.where.isCompleted ? counts.done : counts.total);
    }),
  };
  const checklistModel = {
    findFirst: vi.fn().mockImplementation(() => {
      calls.push('checklist.findFirst');
      return Promise.resolve(checklistReads.length > 0 ? checklistReads.shift() : checklist);
    }),
  };
  const tx = {
    checklistItem,
    checklist: checklistModel,
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
  const service = new ChecklistItemsService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
  );
  return {
    service,
    realtime,
    inTransaction,
    checklistItem,
    checklist: checklistModel,
    tx,
    calls,
    prisma,
  };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

describe('ChecklistItemsService', () => {
  describe('create', () => {
    it('locks the card, then appends after the last item', async () => {
      const { service, checklistItem, tx, calls } = setup({
        checklistReads: [{ cardId: CARD }, { id: LIST_A }],
      });

      const result = await service.create(BOARD, LIST_A, { content: 'Madde' }, ORIGIN);

      expect(calls[1]).toBe('lock');
      // Tagged template: the strings, then the bound card and board ids.
      expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual([CARD, BOARD]);
      expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('item.findMany'));
      expect(checklistItem.findMany.mock.calls[0][0].where).toEqual({ checklistId: LIST_A });
      expect(checklistItem.create.mock.calls[0][0].data).toEqual({
        checklistId: LIST_A,
        content: 'Madde',
        position: 2048 + POSITION_GAP,
      });
      expect(result).toMatchObject({ id: 'new', checklistId: LIST_A, isCompleted: false });
    });

    it('throws 404 when the checklist is not on the board', async () => {
      const { service, tx } = setup({ checklist: null });
      await expect(service.create(BOARD, LIST_A, { content: 'X' }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('throws 404 when the checklist was deleted while waiting for the lock', async () => {
      const { service, checklist, checklistItem, calls } = setup({
        checklistReads: [{ cardId: CARD }, null],
      });

      await expect(service.create(BOARD, LIST_A, { content: 'X' }, ORIGIN)).rejects.toThrow(
        'Checklist not found',
      );

      expect(calls.slice(0, 3)).toEqual(['checklist.findFirst', 'lock', 'checklist.findFirst']);
      expect(checklist.findFirst.mock.calls[1][0].where).toEqual({ id: LIST_A, cardId: CARD });
      expect(checklistItem.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the card is gone at the lock', async () => {
      const { service, checklistItem } = setup({ lock: [] });
      await expect(service.create(BOARD, LIST_A, { content: 'X' }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(checklistItem.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('locks the card, writes content and completion, then counts', async () => {
      const { service, checklistItem, tx, calls } = setup();

      await service.update(BOARD, 'x', { content: 'Yeni', isCompleted: true }, ORIGIN);

      expect(checklistItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'x' },
          data: { content: 'Yeni', isCompleted: true },
        }),
      );
      expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual([CARD, BOARD]);
      expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('item.update'));
      expect(calls.indexOf('item.update')).toBeLessThan(calls.indexOf('count'));
    });

    it('throws 404 when the item is not on the board, before any lock', async () => {
      const { service, tx } = setup({ itemCard: null });

      const error = await service
        .update(BOARD, 'x', { isCompleted: true }, ORIGIN)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('Checklist item not found');
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('throws 404 when the item was deleted while waiting for the lock', async () => {
      const { service, checklistItem, realtime } = setup({ currentItem: null });

      await expect(service.update(BOARD, 'x', { isCompleted: true }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(checklistItem.update).not.toHaveBeenCalled();
      expect(realtime.toBoard).not.toHaveBeenCalled();
    });
  });

  describe('move', () => {
    it('locks the card before reading siblings and writes checklistId and position', async () => {
      const { service, checklistItem, calls } = setup();

      const result = await service.move(BOARD, 'x', {
        checklistId: LIST_B,
        afterItemId: 'a',
        beforeItemId: 'b',
      }, ORIGIN);

      expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('item.findMany'));
      expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('item.update'));
      expect(checklistItem.findMany.mock.calls[0][0].where).toEqual({
        checklistId: LIST_B,
        id: { not: 'x' },
      });
      expect(checklistItem.update).toHaveBeenCalledWith({
        where: { id: 'x' },
        data: { checklistId: LIST_B, position: 1536 },
      });
      expect(result).toEqual({ id: 'x', checklistId: LIST_B, position: 1536 });
    });

    it('moves within the same checklist', async () => {
      const { service, checklist } = setup({ checklist: { id: LIST_A } });

      const result = await service.move(BOARD, 'x', { checklistId: LIST_A }, ORIGIN);

      expect(checklist.findFirst.mock.calls[0][0].where).toEqual({ id: LIST_A, cardId: CARD });
      expect(result).toEqual({ id: 'x', checklistId: LIST_A, position: 2048 + POSITION_GAP });
    });

    it('refuses a target checklist on another card with 400 INVALID_TARGET', async () => {
      const { service, checklistItem } = setup({ checklist: null });

      const error = await service
        .move(BOARD, 'x', { checklistId: 'elsewhere' }, ORIGIN)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_TARGET);
      expect(checklistItem.update).not.toHaveBeenCalled();
    });

    it('throws 404 when the item is not on the board', async () => {
      const { service, tx } = setup({ itemCard: null });
      await expect(service.move(BOARD, 'x', { checklistId: LIST_B }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('throws 404 when the card is gone at the lock', async () => {
      const { service } = setup({ lock: [] });
      await expect(service.move(BOARD, 'x', { checklistId: LIST_B }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when the item was deleted while waiting for the lock', async () => {
      const { service, checklistItem } = setup({ currentItem: null });

      await expect(service.move(BOARD, 'x', { checklistId: LIST_B }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(checklistItem.update).not.toHaveBeenCalled();
    });

    it('turns a stale anchor into 409 POSITION_CONFLICT', async () => {
      const { service, checklistItem } = setup();

      const error = await service
        .move(BOARD, 'x', { checklistId: LIST_B, afterItemId: 'gone' }, ORIGIN)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe(ErrorCode.POSITION_CONFLICT);
      expect(checklistItem.update).not.toHaveBeenCalled();
    });

    it('rebalances the siblings when the gap ran out', async () => {
      const { service, checklistItem } = setup({
        siblings: [
          { id: 'a', position: 1024 },
          { id: 'b', position: 1024 + 1e-7 },
        ],
      });

      const result = await service.move(BOARD, 'x', { checklistId: LIST_B, afterItemId: 'a' }, ORIGIN);

      const writes = checklistItem.update.mock.calls.map(
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
    it('locks the card before deleting, then counts', async () => {
      const { service, checklistItem, calls } = setup();

      await service.remove(BOARD, 'x', ORIGIN);

      expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('item.delete'));
      expect(calls.indexOf('item.delete')).toBeLessThan(calls.indexOf('count'));
      expect(checklistItem.delete).toHaveBeenCalledWith({ where: { id: 'x' } });
    });

    it('throws 404 when the item was deleted while waiting for the lock', async () => {
      const { service, checklistItem } = setup({ currentItem: null });

      await expect(service.remove(BOARD, 'x', ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
      expect(checklistItem.delete).not.toHaveBeenCalled();
    });

    it('throws 404 when the item is not on the board', async () => {
      const { service, tx } = setup({ itemCard: null });
      await expect(service.remove(BOARD, 'x', ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('realtime', () => {
    const COUNTS = { checklistTotal: 5, checklistDone: 2 };

    function types(realtime: { toBoard: ReturnType<typeof vi.fn> }, call = 0): string[] {
      return realtime.toBoard.mock.calls[call][2].map((event: { type: string }) => event.type);
    }

    it('broadcasts checklist-item:created with the counters, after the transaction', async () => {
      const { service, realtime, inTransaction } = setup({
        checklistReads: [{ cardId: CARD }, { id: LIST_A }],
      });

      const item = await service.create(BOARD, LIST_A, { content: 'Madde' }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'checklist-item:created', data: { item, cardId: CARD, counts: COUNTS } },
      ]);
    });

    it('counts after the write, under the card lock', async () => {
      const { service, calls } = setup({ checklistReads: [{ cardId: CARD }, { id: LIST_A }] });

      await service.create(BOARD, LIST_A, { content: 'Madde' }, ORIGIN);

      expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('item.create'));
      expect(calls.indexOf('item.create')).toBeLessThan(calls.indexOf('count'));
    });

    it('broadcasts nothing when create finds no checklist', async () => {
      const { service, realtime } = setup({ checklist: null });

      await expect(service.create(BOARD, LIST_A, { content: 'X' }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts checklist-item:updated with the item and the counters', async () => {
      const { service, realtime, inTransaction } = setup({ counts: { total: 4, done: 4 } });

      const item = await service.update(BOARD, 'x', { isCompleted: true }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        {
          type: 'checklist-item:updated',
          data: { item, cardId: CARD, counts: { checklistTotal: 4, checklistDone: 4 } },
        },
      ]);
    });

    it('broadcasts nothing when the transaction rejects', async () => {
      const { service, realtime, prisma } = setup();
      prisma.$transaction.mockRejectedValueOnce(new Error('deadlock'));

      await expect(service.update(BOARD, 'x', { isCompleted: true }, ORIGIN)).rejects.toThrow(
        'deadlock',
      );

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts checklist-item:moved with the checklist it came from', async () => {
      const { service, realtime, inTransaction } = setup();

      await service.move(BOARD, 'x', { checklistId: LIST_B, afterItemId: 'a' }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        {
          type: 'checklist-item:moved',
          data: {
            id: 'x',
            cardId: CARD,
            fromChecklistId: LIST_A,
            toChecklistId: LIST_B,
            position: 1536,
          },
        },
      ]);
    });

    it('puts position:rebalanced of the target checklist in front of checklist-item:moved', async () => {
      const { service, realtime } = setup({
        siblings: [
          { id: 'a', position: 1024 },
          { id: 'b', position: 1024 + 1e-7 },
        ],
      });

      await service.move(BOARD, 'x', { checklistId: LIST_B, afterItemId: 'a' }, ORIGIN);

      expect(types(realtime)).toEqual(['position:rebalanced', 'checklist-item:moved']);
      expect(realtime.toBoard.mock.calls[0][2][0].data).toEqual({
        entity: 'checklist-item',
        cardId: CARD,
        checklistId: LIST_B,
        positions: [
          { id: 'a', position: POSITION_GAP },
          { id: 'b', position: 3 * POSITION_GAP },
        ],
      });
    });

    it('broadcasts nothing when a move is refused', async () => {
      const { service, realtime } = setup({ checklist: null });

      await expect(
        service.move(BOARD, 'x', { checklistId: 'elsewhere' }, ORIGIN),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts checklist-item:deleted with the checklist the item was in and the counters', async () => {
      const { service, realtime, inTransaction } = setup({ counts: { total: 1, done: 0 } });

      await service.remove(BOARD, 'x', ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        {
          type: 'checklist-item:deleted',
          data: {
            id: 'x',
            checklistId: LIST_A,
            cardId: CARD,
            counts: { checklistTotal: 1, checklistDone: 0 },
          },
        },
      ]);
    });

    it('broadcasts nothing when the item is not on the board', async () => {
      const { service, realtime } = setup({ itemCard: null });

      await expect(service.remove(BOARD, 'x', ORIGIN)).rejects.toBeInstanceOf(NotFoundException);

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });
  });
});
