import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ErrorCode, POSITION_GAP } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ListsService } from './lists.service.js';

const BOARD = 'board-1';
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
    delete: vi.fn(),
  };
  const tx = {
    list,
    $queryRaw: vi.fn().mockResolvedValue(boardExists ? [{ id: BOARD }] : []),
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  return { service: new ListsService(prisma as unknown as PrismaService), list, tx };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

describe('ListsService', () => {
  describe('create', () => {
    it('locks the board and appends after the last list', async () => {
      const { service, list, tx } = setup();

      const result = await service.create(BOARD, { title: 'C' });

      expect(tx.$queryRaw).toHaveBeenCalledOnce();
      expect(list.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { boardId: BOARD, title: 'C', position: 2048 + POSITION_GAP } }),
      );
      expect(result.position).toBe(2048 + POSITION_GAP);
    });

    it('turns a stale anchor into 409 POSITION_CONFLICT', async () => {
      const { service, list } = setup();

      const error = await service
        .create(BOARD, { title: 'C', afterListId: 'gone' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe(ErrorCode.POSITION_CONFLICT);
      expect(list.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the board was deleted meanwhile', async () => {
      const { service } = setup({ boardExists: false });
      await expect(service.create(BOARD, { title: 'C' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('writes rebalanced positions before creating', async () => {
      const { service, list } = setup({
        siblings: [
          { id: 'a', position: 1 },
          { id: 'b', position: 1 + 1e-7 },
        ],
      });

      await service.create(BOARD, { title: 'C', afterListId: 'a' });

      expect(list.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { position: 1024 } });
      expect(list.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { position: 3072 } });
      expect(list.create.mock.calls[0][0].data.position).toBe(2048);
    });
  });

  describe('move', () => {
    it('excludes the moved list from its own siblings', async () => {
      const { service, list } = setup();

      await service.move(BOARD, 'b', { beforeListId: 'a' });

      expect(list.findMany.mock.calls[0][0].where).toEqual({
        boardId: BOARD,
        archivedAt: null,
        id: { not: 'b' },
      });
      expect(list.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { position: 512 } });
    });

    it('refuses archived lists with 400 INVALID_TARGET', async () => {
      const { service } = setup({ current: { archivedAt: ARCHIVED_AT } });

      const error = await service.move(BOARD, 'a', {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_TARGET);
    });

    it('throws 404 for a list that is not on the board', async () => {
      const { service } = setup({ current: null });
      await expect(service.move(BOARD, 'x', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('archives without touching the position', async () => {
      const { service, list } = setup();

      await service.update(BOARD, 'a', { archived: true });

      const { data } = list.update.mock.calls[0][0];
      expect(data.archivedAt).toBeInstanceOf(Date);
      expect(data.position).toBeUndefined();
    });

    it('keeps the first archive date when archiving twice', async () => {
      const { service, list } = setup({ current: { archivedAt: ARCHIVED_AT } });

      await service.update(BOARD, 'a', { archived: true });

      expect(list.update.mock.calls[0][0].data.archivedAt).toBeUndefined();
    });

    it('restores an archived list to the end', async () => {
      const { service, list } = setup({ current: { archivedAt: ARCHIVED_AT } });

      await service.update(BOARD, 'c', { archived: false });

      expect(list.update.mock.calls[0][0].data).toEqual({
        title: undefined,
        archivedAt: null,
        position: 2048 + POSITION_GAP,
      });
    });
  });
});
