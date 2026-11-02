import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ErrorCode, POSITION_GAP } from '@trello/contracts';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ChecklistItemsService } from './checklist-items.service.js';

const BOARD = 'board-1';
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
  currentItem = { id: 'x' } as { id: string } | null,
  checklist = { id: LIST_B } as { id: string } | null,
  siblings = [
    { id: 'a', position: 1024 },
    { id: 'b', position: 2048 },
  ],
  deleted = 1,
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
    deleteMany: vi.fn().mockImplementation(() => {
      calls.push('item.deleteMany');
      return Promise.resolve({ count: deleted });
    }),
  };
  const checklistModel = {
    findFirst: vi.fn().mockImplementation(() => {
      calls.push('checklist.findFirst');
      return Promise.resolve(checklist);
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
  const prisma = {
    ...tx,
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  return {
    service: new ChecklistItemsService(prisma as unknown as PrismaService),
    checklistItem,
    checklist: checklistModel,
    tx,
    calls,
  };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

describe('ChecklistItemsService', () => {
  describe('create', () => {
    it('locks the card, then appends after the last item', async () => {
      const { service, checklistItem, calls } = setup();

      const result = await service.create(BOARD, LIST_A, { content: 'Madde' });

      expect(calls[1]).toBe('lock');
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
      await expect(service.create(BOARD, LIST_A, { content: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('throws 404 when the card is gone at the lock', async () => {
      const { service, checklistItem } = setup({ lock: [] });
      await expect(service.create(BOARD, LIST_A, { content: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(checklistItem.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('writes content and completion scoped to the board, without a lock', async () => {
      const { service, checklistItem, tx } = setup();

      await service.update(BOARD, 'x', { content: 'Yeni', isCompleted: true });

      expect(checklistItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'x', checklist: { card: { boardId: BOARD } } },
          data: { content: 'Yeni', isCompleted: true },
        }),
      );
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('turns P2025 into 404 Checklist item not found', async () => {
      const { service, checklistItem } = setup();
      checklistItem.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
      );

      const error = await service.update(BOARD, 'x', { isCompleted: true }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('Checklist item not found');
    });
  });

  describe('move', () => {
    it('locks the card before reading siblings and writes checklistId and position', async () => {
      const { service, checklistItem, calls } = setup();

      const result = await service.move(BOARD, 'x', {
        checklistId: LIST_B,
        afterItemId: 'a',
        beforeItemId: 'b',
      });

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

      const result = await service.move(BOARD, 'x', { checklistId: LIST_A });

      expect(checklist.findFirst.mock.calls[0][0].where).toEqual({ id: LIST_A, cardId: CARD });
      expect(result).toEqual({ id: 'x', checklistId: LIST_A, position: 2048 + POSITION_GAP });
    });

    it('refuses a target checklist on another card with 400 INVALID_TARGET', async () => {
      const { service, checklistItem } = setup({ checklist: null });

      const error = await service
        .move(BOARD, 'x', { checklistId: 'elsewhere' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_TARGET);
      expect(checklistItem.update).not.toHaveBeenCalled();
    });

    it('throws 404 when the item is not on the board', async () => {
      const { service, tx } = setup({ itemCard: null });
      await expect(service.move(BOARD, 'x', { checklistId: LIST_B })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('throws 404 when the card is gone at the lock', async () => {
      const { service } = setup({ lock: [] });
      await expect(service.move(BOARD, 'x', { checklistId: LIST_B })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when the item was deleted while waiting for the lock', async () => {
      const { service, checklistItem } = setup({ currentItem: null });

      await expect(service.move(BOARD, 'x', { checklistId: LIST_B })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(checklistItem.update).not.toHaveBeenCalled();
    });

    it('turns a stale anchor into 409 POSITION_CONFLICT', async () => {
      const { service, checklistItem } = setup();

      const error = await service
        .move(BOARD, 'x', { checklistId: LIST_B, afterItemId: 'gone' })
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

      const result = await service.move(BOARD, 'x', { checklistId: LIST_B, afterItemId: 'a' });

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
    it('locks the card before deleting', async () => {
      const { service, checklistItem, calls } = setup();

      await service.remove(BOARD, 'x');

      expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('item.deleteMany'));
      expect(checklistItem.deleteMany).toHaveBeenCalledWith({
        where: { id: 'x', checklist: { cardId: CARD } },
      });
    });

    it('throws 404 when nothing was deleted', async () => {
      const { service } = setup({ deleted: 0 });
      await expect(service.remove(BOARD, 'x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the item is not on the board', async () => {
      const { service, tx } = setup({ itemCard: null });
      await expect(service.remove(BOARD, 'x')).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
