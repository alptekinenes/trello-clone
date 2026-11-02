import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ErrorCode, POSITION_GAP } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CardsService } from './cards.service.js';

const BOARD = 'board-1';
const LIST = 'list-1';
const OTHER_LIST = 'list-2';
const ARCHIVED_AT = new Date('2026-10-28T10:00:00.000Z');

interface Current {
  listId: string;
  archivedAt: Date | null;
}

function row(id: string, listId: string, position: number, archivedAt: Date | null = null) {
  return {
    id,
    listId,
    title: id.toUpperCase(),
    position,
    dueDate: null,
    dueComplete: false,
    archivedAt,
    description: null,
    labels: [],
    checklists: [],
  };
}

/**
 * Fake Prisma whose $transaction runs the callback with the same fake as `tx`.
 * `reads` are the card states returned by successive findFirst calls
 * (before and after the lock); `locked` is what the list lock returns.
 */
function setup({
  reads = [{ listId: LIST, archivedAt: null }] as (Current | null)[],
  locked = [
    { id: LIST, archivedAt: null },
    { id: OTHER_LIST, archivedAt: null },
  ] as { id: string; archivedAt: Date | null }[],
  siblings = [
    { id: 'a', position: 1024 },
    { id: 'b', position: 2048 },
  ],
} = {}) {
  const findFirst = vi.fn();
  for (const read of reads) findFirst.mockResolvedValueOnce(read);
  findFirst.mockResolvedValue(reads.at(-1));

  const card = {
    findFirst,
    findMany: vi.fn().mockResolvedValue(siblings),
    create: vi
      .fn()
      .mockImplementation(({ data }) => Promise.resolve(row('new', data.listId, data.position))),
    update: vi
      .fn()
      .mockImplementation(({ where, data }) =>
        Promise.resolve(row(where.id, LIST, data.position ?? 0, data.archivedAt ?? null)),
      ),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn(),
  };
  const tx = { card, $queryRaw: vi.fn().mockResolvedValue(locked) };
  const prisma = {
    ...tx,
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  return { service: new CardsService(prisma as unknown as PrismaService), card, tx };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

/** Values bound to the raw lock query (the uuid casts are nested Sql fragments). */
function lockedIds(queryRaw: ReturnType<typeof vi.fn>): unknown[] {
  const [, boardId, ...rest] = queryRaw.mock.calls[0] as [unknown, unknown, ...unknown[]];
  return [boardId, ...rest.flatMap((part) => (part as { values: unknown[] }).values)];
}

describe('CardsService', () => {
  describe('create', () => {
    it('locks the list and appends after the last card', async () => {
      const { service, card, tx } = setup({ locked: [{ id: LIST, archivedAt: null }] });

      const result = await service.create(BOARD, LIST, { title: 'Yeni' });

      expect(tx.$queryRaw).toHaveBeenCalledOnce();
      expect(lockedIds(tx.$queryRaw)).toEqual([BOARD, LIST]);
      expect(card.findMany.mock.calls[0][0].where).toEqual({ listId: LIST, archivedAt: null });
      expect(card.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { boardId: BOARD, listId: LIST, title: 'Yeni', position: 2048 + POSITION_GAP },
        }),
      );
      expect(result).toMatchObject({ id: 'new', listId: LIST, position: 2048 + POSITION_GAP });
    });

    it('inserts before an anchor', async () => {
      const { service, card } = setup({ locked: [{ id: LIST, archivedAt: null }] });

      await service.create(BOARD, LIST, { title: 'İlk', beforeCardId: 'a' });

      expect(card.create.mock.calls[0][0].data.position).toBe(512);
    });

    it('refuses an archived list with 400 INVALID_TARGET', async () => {
      const { service, card } = setup({ locked: [{ id: LIST, archivedAt: ARCHIVED_AT }] });

      const error = await service.create(BOARD, LIST, { title: 'X' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_TARGET);
      expect(card.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the list was deleted meanwhile', async () => {
      const { service } = setup({ locked: [] });
      await expect(service.create(BOARD, LIST, { title: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('turns a stale anchor into 409 POSITION_CONFLICT', async () => {
      const { service, card } = setup({ locked: [{ id: LIST, archivedAt: null }] });

      const error = await service
        .create(BOARD, LIST, { title: 'X', afterCardId: 'gone' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe(ErrorCode.POSITION_CONFLICT);
      expect(card.create).not.toHaveBeenCalled();
    });
  });

  describe('move', () => {
    it('locks the source and target lists and places the card among the target cards', async () => {
      const { service, card, tx } = setup();

      const result = await service.move(BOARD, 'c', { listId: OTHER_LIST, afterCardId: 'a' });

      expect(lockedIds(tx.$queryRaw)).toEqual([BOARD, LIST, OTHER_LIST]);
      expect(card.findMany.mock.calls[0][0].where).toEqual({
        listId: OTHER_LIST,
        archivedAt: null,
        id: { not: 'c' },
      });
      expect(card.update).toHaveBeenCalledWith({
        where: { id: 'c' },
        data: { listId: OTHER_LIST, position: 1536 },
      });
      expect(result).toEqual({ id: 'c', listId: OTHER_LIST, position: 1536 });
    });

    it('locks one list for a move inside it', async () => {
      const { service, tx } = setup({ locked: [{ id: LIST, archivedAt: null }] });

      await service.move(BOARD, 'c', { listId: LIST });

      expect(lockedIds(tx.$queryRaw)).toEqual([BOARD, LIST]);
    });

    it.each([
      ['on another board (not locked)', [{ id: LIST, archivedAt: null }]],
      [
        'archived',
        [
          { id: LIST, archivedAt: null },
          { id: OTHER_LIST, archivedAt: ARCHIVED_AT },
        ],
      ],
    ])('refuses a target list that is %s with 400 INVALID_TARGET', async (_, locked) => {
      const { service, card } = setup({ locked });

      const error = await service.move(BOARD, 'c', { listId: OTHER_LIST }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_TARGET);
      expect(card.update).not.toHaveBeenCalled();
    });

    it('refuses archived cards with 400 INVALID_TARGET', async () => {
      const { service } = setup({ reads: [{ listId: LIST, archivedAt: ARCHIVED_AT }] });

      const error = await service.move(BOARD, 'c', { listId: LIST }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_TARGET);
    });

    it('returns 409 when the card changed lists before the lock was taken', async () => {
      const { service, card } = setup({
        reads: [
          { listId: LIST, archivedAt: null },
          { listId: 'list-3', archivedAt: null },
        ],
      });

      const error = await service.move(BOARD, 'c', { listId: OTHER_LIST }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe(ErrorCode.POSITION_CONFLICT);
      expect(card.update).not.toHaveBeenCalled();
    });

    it('throws 404 for a card that is not on the board', async () => {
      const { service, tx } = setup({ reads: [null] });

      await expect(service.move(BOARD, 'x', { listId: LIST })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('writes rebalanced positions of the target cards before moving', async () => {
      const { service, card } = setup({
        siblings: [
          { id: 'a', position: 1 },
          { id: 'b', position: 1 + 1e-7 },
        ],
      });

      await service.move(BOARD, 'c', { listId: OTHER_LIST, afterCardId: 'a' });

      expect(card.update.mock.calls).toEqual([
        [{ where: { id: 'a' }, data: { position: 1024 } }],
        [{ where: { id: 'b' }, data: { position: 3072 } }],
        [{ where: { id: 'c' }, data: { listId: OTHER_LIST, position: 2048 } }],
      ]);
    });
  });

  describe('update', () => {
    it('renames and archives without taking a list lock', async () => {
      const { service, card, tx } = setup();

      await service.update(BOARD, 'c', { title: 'Yeni ad' });
      await service.update(BOARD, 'c', { archived: true });

      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(card.update.mock.calls[0][0].data).toEqual({ title: 'Yeni ad' });
      expect(card.update.mock.calls[1][0].data.archivedAt).toBeInstanceOf(Date);
    });

    it('keeps the first archive date when archiving twice', async () => {
      const { service, card } = setup({ reads: [{ listId: LIST, archivedAt: ARCHIVED_AT }] });
      await service.update(BOARD, 'c', { archived: true });
      expect(card.update.mock.calls[0][0].data.archivedAt).toBeUndefined();
    });

    it('restores an archived card to the end of its list under the list lock', async () => {
      const { service, card, tx } = setup({ reads: [{ listId: LIST, archivedAt: ARCHIVED_AT }] });

      await service.update(BOARD, 'c', { archived: false });

      expect(lockedIds(tx.$queryRaw)).toEqual([BOARD, LIST]);
      expect(card.update.mock.calls[0][0].data).toEqual({
        title: undefined,
        archivedAt: null,
        position: 2048 + POSITION_GAP,
      });
    });

    it('refuses to restore a card whose list is archived', async () => {
      const { service, card } = setup({
        reads: [{ listId: LIST, archivedAt: ARCHIVED_AT }],
        locked: [{ id: LIST, archivedAt: ARCHIVED_AT }],
      });

      const error = await service.update(BOARD, 'c', { archived: false }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_TARGET);
      expect(card.update).not.toHaveBeenCalled();
    });
  });

  describe('update content', () => {
    it('writes description, due date and completion', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', {
        description: 'Ayrıntı',
        dueDate: '2026-11-05T15:00:00+03:00',
        dueComplete: true,
      });

      const { data } = card.update.mock.calls[0][0];
      expect(data.description).toBe('Ayrıntı');
      expect(data.dueDate).toEqual(new Date('2026-11-05T12:00:00.000Z'));
      expect(data.dueComplete).toBe(true);
    });

    it('resets dueComplete when the due date is cleared', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { dueDate: null, dueComplete: true });

      const { data } = card.update.mock.calls[0][0];
      expect(data.dueDate).toBeNull();
      expect(data.dueComplete).toBe(false);
    });

    it('completes the date only if the card still has one, in a single conditional write', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { dueComplete: true });

      expect(card.updateMany).toHaveBeenCalledWith({
        where: { id: 'c', boardId: BOARD, dueDate: { not: null } },
        data: { dueComplete: true },
      });
      expect(card.update.mock.calls[0][0].data.dueComplete).toBeUndefined();
    });

    it('writes completion directly when the same request sets the date', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { dueDate: '2026-11-05T12:00:00Z', dueComplete: true });

      expect(card.updateMany).not.toHaveBeenCalled();
      expect(card.update.mock.calls[0][0].data.dueComplete).toBe(true);
    });

    it('leaves the due date alone when it is not sent', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { title: 'Yeni' });

      expect(card.update.mock.calls[0][0].data).not.toHaveProperty('dueDate');
    });

    it('reports hasDescription from the stored value', async () => {
      const { service, card } = setup();
      card.update.mockResolvedValueOnce({ ...row('c', LIST, 1024), description: 'Var' });
      card.update.mockResolvedValueOnce({ ...row('c', LIST, 1024), description: null });

      await expect(service.update(BOARD, 'c', { description: 'Var' })).resolves.toMatchObject({
        hasDescription: true,
      });
      const cleared = await service.update(BOARD, 'c', { description: null });
      expect(cleared.hasDescription).toBe(false);
      expect(cleared).not.toHaveProperty('description');
    });
  });

  describe('getDetail', () => {
    it('reads the card scoped to the board and maps checklists', async () => {
      const { service, card } = setup();
      card.findFirst.mockReset().mockResolvedValueOnce({
        ...row('c', LIST, 1024),
        boardId: BOARD,
        description: 'Metin',
        checklists: [
          {
            id: 'cl',
            cardId: 'c',
            title: 'Liste',
            position: 1024,
            items: [
              { id: 'i', checklistId: 'cl', content: 'Madde', isCompleted: true, position: 1024 },
            ],
          },
        ],
      });

      const detail = await service.getDetail(BOARD, 'c');

      expect(card.findFirst.mock.calls[0][0].where).toEqual({ id: 'c', boardId: BOARD });
      expect(detail).toMatchObject({
        id: 'c',
        boardId: BOARD,
        description: 'Metin',
        hasDescription: true,
        checklistTotal: 1,
        checklistDone: 1,
        checklists: [{ id: 'cl', items: [{ id: 'i', isCompleted: true }] }],
      });
    });

    it('throws 404 when the card is not on the board', async () => {
      const { service, card } = setup();
      card.findFirst.mockReset().mockResolvedValueOnce(null);
      await expect(service.getDetail(BOARD, 'c')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listForBoard', () => {
    it('lists active cards of active lists in board order', async () => {
      const { service, card } = setup({ siblings: [] });

      await service.listForBoard(BOARD, false);

      expect(card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { boardId: BOARD, archivedAt: null, list: { archivedAt: null } },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('lists the archive newest first', async () => {
      const { service, card } = setup({ siblings: [] });

      await service.listForBoard(BOARD, true);

      expect(card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { boardId: BOARD, archivedAt: { not: null } },
          orderBy: [{ archivedAt: 'desc' }, { id: 'asc' }],
        }),
      );
    });
  });
});
