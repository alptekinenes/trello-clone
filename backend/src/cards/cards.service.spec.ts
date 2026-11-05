import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ErrorCode, POSITION_GAP } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { CardsService } from './cards.service.js';

const BOARD = 'board-1';
const ORIGIN: EventOrigin = { actorId: 'user-1', socketId: 'socket-1' };
const LIST = 'list-1';
const ATTACHMENT = '6f1c3c1e-7a51-4b8a-9d55-0f3a3e1d2c4b';
const OTHER_LIST = 'list-2';
const ARCHIVED_AT = new Date('2026-10-28T10:00:00.000Z');

interface Current {
  listId: string;
  archivedAt: Date | null;
  completedAt?: Date | null;
}

function row(id: string, listId: string, position: number, archivedAt: Date | null = null) {
  return {
    id,
    listId,
    title: id.toUpperCase(),
    position,
    dueDate: null,
    dueComplete: false,
    completedAt: null,
    coverColor: null,
    archivedAt,
    commentCount: 0,
    attachmentCount: 0,
    coverAttachmentId: null,
    description: null,
    labels: [],
    members: [],
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
    { id: LIST, title: 'Yapılacak', archivedAt: null },
    { id: OTHER_LIST, title: 'Bitti', archivedAt: null },
  ] as { id: string; title: string; archivedAt: Date | null }[],
  siblings = [
    { id: 'a', position: 1024 },
    { id: 'b', position: 2048 },
  ],
} = {}) {
  const findFirst = vi.fn();
  const withTitle = (read: Current | null) => (read ? { title: 'Kart', ...read } : read);
  for (const read of reads) findFirst.mockResolvedValueOnce(withTitle(read));
  findFirst.mockResolvedValue(withTitle(reads.at(-1) ?? null));

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
    delete: vi.fn().mockResolvedValue({ listId: LIST }),
  };
  const activity = {
    create: vi.fn(({ data }: { data: { cardId: string; actorId: string; type: string; data: unknown } }) =>
      Promise.resolve({
        id: `activity-${activity.create.mock.calls.length}`,
        cardId: data.cardId,
        type: data.type,
        data: data.data,
        createdAt: new Date('2026-11-05T10:00:00.000Z'),
        actor: { id: data.actorId, name: 'Ayşe', avatarUrl: null },
      }),
    ),
  };
  const attachment = {
    findFirst: vi.fn().mockResolvedValue({ mimeType: 'image/png' }),
    findMany: vi.fn().mockResolvedValue([{ storageKey: 'key-1' }, { storageKey: 'key-2' }]),
  };
  const storage = { deleteQuietly: vi.fn().mockResolvedValue(undefined) };
  const tx = { card, activity, attachment, $queryRaw: vi.fn().mockResolvedValue(locked) };
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
  const service = new CardsService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
    new ActivityService(),
    storage as unknown as StorageService,
  );
  return { service, realtime, inTransaction, card, tx, prisma, activity, attachment, storage };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

/** Values bound to the raw lock query (the uuid casts are nested Sql fragments). */
function lockedIds(queryRaw: ReturnType<typeof vi.fn>): unknown[] {
  const [, boardId, ...rest] = queryRaw.mock.calls[0] as [unknown, unknown, ...unknown[]];
  return [boardId, ...rest.flatMap((part) => (part as { values: unknown[] }).values)];
}

/** Values bound to the card row lock: the uuid casts are nested Sql fragments. */
function lockedCardRow(queryRaw: ReturnType<typeof vi.fn>): unknown[] {
  const [, ...parts] = queryRaw.mock.calls[0] as [unknown, ...unknown[]];
  return parts.flatMap((part) => (part as { values?: unknown[] }).values ?? [part]);
}

describe('CardsService', () => {
  describe('create', () => {
    it('locks the list and appends after the last card', async () => {
      const { service, card, tx } = setup({ locked: [{ id: LIST, title: 'Yapılacak', archivedAt: null }] });

      const result = await service.create(BOARD, LIST, { title: 'Yeni' }, ORIGIN);

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
      const { service, card } = setup({ locked: [{ id: LIST, title: 'Yapılacak', archivedAt: null }] });

      await service.create(BOARD, LIST, { title: 'İlk', beforeCardId: 'a' }, ORIGIN);

      expect(card.create.mock.calls[0][0].data.position).toBe(512);
    });

    it('refuses an archived list with 400 INVALID_TARGET', async () => {
      const { service, card } = setup({ locked: [{ id: LIST, title: 'Yapılacak', archivedAt: ARCHIVED_AT }] });

      const error = await service.create(BOARD, LIST, { title: 'X' }, ORIGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_TARGET);
      expect(card.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the list was deleted meanwhile', async () => {
      const { service } = setup({ locked: [] });
      await expect(service.create(BOARD, LIST, { title: 'X' }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('turns a stale anchor into 409 POSITION_CONFLICT', async () => {
      const { service, card } = setup({ locked: [{ id: LIST, title: 'Yapılacak', archivedAt: null }] });

      const error = await service
        .create(BOARD, LIST, { title: 'X', afterCardId: 'gone' }, ORIGIN)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe(ErrorCode.POSITION_CONFLICT);
      expect(card.create).not.toHaveBeenCalled();
    });
  });

  describe('move', () => {
    it('locks the source and target lists and places the card among the target cards', async () => {
      const { service, card, tx } = setup();

      const result = await service.move(BOARD, 'c', { listId: OTHER_LIST, afterCardId: 'a' }, ORIGIN);

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
      expect(result).toEqual({ id: 'c', listId: OTHER_LIST, position: 1536, rebalanced: null });
    });

    it('locks one list for a move inside it', async () => {
      const { service, tx } = setup({ locked: [{ id: LIST, title: 'Yapılacak', archivedAt: null }] });

      await service.move(BOARD, 'c', { listId: LIST }, ORIGIN);

      expect(lockedIds(tx.$queryRaw)).toEqual([BOARD, LIST]);
    });

    it.each([
      ['on another board (not locked)', [{ id: LIST, title: 'Yapılacak', archivedAt: null }]],
      [
        'archived',
        [
          { id: LIST, title: 'Yapılacak', archivedAt: null },
          { id: OTHER_LIST, title: 'Bitti', archivedAt: ARCHIVED_AT },
        ],
      ],
    ])('refuses a target list that is %s with 400 INVALID_TARGET', async (_, locked) => {
      const { service, card } = setup({ locked });

      const error = await service.move(BOARD, 'c', { listId: OTHER_LIST }, ORIGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_TARGET);
      expect(card.update).not.toHaveBeenCalled();
    });

    it('refuses archived cards with 400 INVALID_TARGET', async () => {
      const { service } = setup({ reads: [{ listId: LIST, archivedAt: ARCHIVED_AT }] });

      const error = await service.move(BOARD, 'c', { listId: LIST }, ORIGIN).catch((e: unknown) => e);

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

      const error = await service.move(BOARD, 'c', { listId: OTHER_LIST }, ORIGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe(ErrorCode.POSITION_CONFLICT);
      expect(card.update).not.toHaveBeenCalled();
    });

    it('throws 404 for a card that is not on the board', async () => {
      const { service, tx } = setup({ reads: [null] });

      await expect(service.move(BOARD, 'x', { listId: LIST }, ORIGIN)).rejects.toBeInstanceOf(
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

      await service.move(BOARD, 'c', { listId: OTHER_LIST, afterCardId: 'a' }, ORIGIN);

      expect(card.update.mock.calls).toEqual([
        [{ where: { id: 'a' }, data: { position: 1024 } }],
        [{ where: { id: 'b' }, data: { position: 3072 } }],
        [{ where: { id: 'c' }, data: { listId: OTHER_LIST, position: 2048 } }],
      ]);
    });

    it('returns the rebalanced positions of the target list', async () => {
      const { service } = setup({
        siblings: [
          { id: 'a', position: 1 },
          { id: 'b', position: 1 + 1e-7 },
        ],
      });

      const result = await service.move(
        BOARD,
        'c',
        { listId: OTHER_LIST, afterCardId: 'a' },
        ORIGIN,
      );

      expect(result).toEqual({
        id: 'c',
        listId: OTHER_LIST,
        position: 2048,
        rebalanced: {
          entity: 'card',
          listId: OTHER_LIST,
          positions: [
            { id: 'a', position: 1024 },
            { id: 'b', position: 3072 },
          ],
        },
      });
    });
  });

  describe('update', () => {
    it('renames without a lock and archives under the card lock only, never a list lock', async () => {
      const { service, card, tx } = setup();

      await service.update(BOARD, 'c', { title: 'Yeni ad' }, ORIGIN);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
      await service.update(BOARD, 'c', { archived: true }, ORIGIN);

      expect(tx.$queryRaw).toHaveBeenCalledOnce();
      expect(lockedCardRow(tx.$queryRaw)).toEqual(['c', BOARD]);
      expect(card.update.mock.calls[0][0].data).toEqual({ title: 'Yeni ad' });
      expect(card.update.mock.calls[1][0].data.archivedAt).toBeInstanceOf(Date);
    });

    it('keeps the first archive date when archiving twice', async () => {
      const { service, card } = setup({ reads: [{ listId: LIST, archivedAt: ARCHIVED_AT }] });
      await service.update(BOARD, 'c', { archived: true }, ORIGIN);
      expect(card.update.mock.calls[0][0].data.archivedAt).toBeUndefined();
    });

    it('marks a card complete with the current time', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { isCompleted: true }, ORIGIN);

      expect(card.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
    });

    it('keeps the first completion time when completing twice', async () => {
      const first = new Date('2026-11-01T08:00:00.000Z');
      const { service, card } = setup({
        reads: [{ listId: LIST, archivedAt: null, completedAt: first }],
      });

      await service.update(BOARD, 'c', { isCompleted: true }, ORIGIN);

      expect(card.update.mock.calls[0][0].data.completedAt).toBe(first);
    });

    it('clears the completion time when isCompleted is false', async () => {
      const { service, card } = setup({
        reads: [{ listId: LIST, archivedAt: null, completedAt: new Date() }],
      });

      await service.update(BOARD, 'c', { isCompleted: false }, ORIGIN);

      expect(card.update.mock.calls[0][0].data.completedAt).toBeNull();
    });

    it('leaves completion alone when isCompleted is not sent', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { title: 'Yeni' }, ORIGIN);

      expect(card.update.mock.calls[0][0].data).not.toHaveProperty('completedAt');
      expect(card.update.mock.calls[0][0].data).not.toHaveProperty('coverColor');
    });

    it('sets and removes the cover color', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { coverColor: 'BLUE' }, ORIGIN);
      await service.update(BOARD, 'c', { coverColor: null }, ORIGIN);

      expect(card.update.mock.calls[0][0].data.coverColor).toBe('BLUE');
      expect(card.update.mock.calls[1][0].data.coverColor).toBeNull();
    });

    it('sets an image attachment of the card as the cover and clears the color', async () => {
      const { service, card, attachment } = setup();

      await service.update(BOARD, 'c', { coverAttachmentId: ATTACHMENT }, ORIGIN);

      expect(attachment.findFirst).toHaveBeenCalledWith({
        where: { id: ATTACHMENT, cardId: 'c', boardId: BOARD },
        select: { mimeType: true },
      });
      const { data } = card.update.mock.calls[0][0];
      expect(data.coverAttachment).toEqual({ connect: { id: ATTACHMENT } });
      expect(data.coverColor).toBeNull();
    });

    it.each([
      ['an attachment of another card', null],
      ['a PDF', { mimeType: 'application/pdf' }],
      ['an SVG', { mimeType: 'image/svg+xml' }],
    ])('refuses %s as the cover with INVALID_COVER', async (_label, found) => {
      const { service, card, attachment, realtime } = setup();
      attachment.findFirst.mockResolvedValue(found);

      const error = await service
        .update(BOARD, 'c', { coverAttachmentId: ATTACHMENT }, ORIGIN)
        .catch((e: unknown) => e);

      expect((error as { getStatus(): number }).getStatus()).toBe(400);
      expect(codeOf(error)).toBe(ErrorCode.INVALID_COVER);
      expect(card.update).not.toHaveBeenCalled();
      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('clears the image cover when a cover color is set, and leaves it alone otherwise', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { coverColor: 'RED' }, ORIGIN);
      await service.update(BOARD, 'c', { coverColor: null }, ORIGIN);
      await service.update(BOARD, 'c', { coverAttachmentId: null }, ORIGIN);
      await service.update(BOARD, 'c', { title: 'Yeni' }, ORIGIN);

      expect(card.update.mock.calls[0][0].data.coverAttachment).toEqual({ disconnect: true });
      expect(card.update.mock.calls[1][0].data).not.toHaveProperty('coverAttachment');
      expect(card.update.mock.calls[2][0].data.coverAttachment).toEqual({ disconnect: true });
      expect(card.update.mock.calls[2][0].data).not.toHaveProperty('coverColor');
      expect(card.update.mock.calls[3][0].data).not.toHaveProperty('coverAttachment');
    });

    it('clears both kinds of cover when both are null', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { coverColor: null, coverAttachmentId: null }, ORIGIN);

      const { data } = card.update.mock.calls[0][0];
      expect(data.coverColor).toBeNull();
      expect(data.coverAttachment).toEqual({ disconnect: true });
    });

    it('restores an archived card to the end of its list under the list lock', async () => {
      const { service, card, tx } = setup({ reads: [{ listId: LIST, archivedAt: ARCHIVED_AT }] });

      await service.update(BOARD, 'c', { archived: false }, ORIGIN);

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
        locked: [{ id: LIST, title: 'Yapılacak', archivedAt: ARCHIVED_AT }],
      });

      const error = await service.update(BOARD, 'c', { archived: false }, ORIGIN).catch((e: unknown) => e);

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
      }, ORIGIN);

      const { data } = card.update.mock.calls[0][0];
      expect(data.description).toBe('Ayrıntı');
      expect(data.dueDate).toEqual(new Date('2026-11-05T12:00:00.000Z'));
      expect(data.dueComplete).toBe(true);
    });

    it('resets dueComplete when the due date is cleared', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { dueDate: null, dueComplete: true }, ORIGIN);

      const { data } = card.update.mock.calls[0][0];
      expect(data.dueDate).toBeNull();
      expect(data.dueComplete).toBe(false);
    });

    it('completes the date only if the card still has one, in a single conditional write', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { dueComplete: true }, ORIGIN);

      expect(card.updateMany).toHaveBeenCalledWith({
        where: { id: 'c', boardId: BOARD, dueDate: { not: null } },
        data: { dueComplete: true },
      });
      expect(card.update.mock.calls[0][0].data.dueComplete).toBeUndefined();
    });

    it('writes completion directly when the same request sets the date', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { dueDate: '2026-11-05T12:00:00Z', dueComplete: true }, ORIGIN);

      expect(card.updateMany).not.toHaveBeenCalled();
      expect(card.update.mock.calls[0][0].data.dueComplete).toBe(true);
    });

    it('leaves the due date alone when it is not sent', async () => {
      const { service, card } = setup();

      await service.update(BOARD, 'c', { title: 'Yeni' }, ORIGIN);

      expect(card.update.mock.calls[0][0].data).not.toHaveProperty('dueDate');
    });

    it('reports hasDescription from the stored value', async () => {
      const { service, card } = setup();
      card.update.mockResolvedValueOnce({ ...row('c', LIST, 1024), description: 'Var' });
      card.update.mockResolvedValueOnce({ ...row('c', LIST, 1024), description: null });

      await expect(service.update(BOARD, 'c', { description: 'Var' }, ORIGIN)).resolves.toMatchObject({
        hasDescription: true,
      });
      const cleared = await service.update(BOARD, 'c', { description: null }, ORIGIN);
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
        attachments: [
          {
            id: 'a1',
            cardId: 'c',
            fileName: 'rapor.pdf',
            mimeType: 'application/pdf',
            size: 12,
            createdAt: new Date('2026-11-05T10:00:00.000Z'),
            uploader: { id: 'u', name: 'Ayşe', avatarUrl: null },
          },
        ],
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
        attachments: [
          { id: 'a1', fileName: 'rapor.pdf', mimeType: 'application/pdf', uploader: { id: 'u' } },
        ],
      });
      expect(card.findFirst.mock.calls[0][0].select.attachments).toMatchObject({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      });
      expect(JSON.stringify(detail)).not.toContain('storageKey');
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

  describe('activity', () => {
    interface Written {
      type: string;
      data: unknown;
      actorId: string;
      cardId: string;
    }
    const recorded = (activity: { create: ReturnType<typeof vi.fn> }): Written[] =>
      (activity.create.mock.calls as [{ data: Written }][]).map(([arg]) => arg.data);

    function types(realtime: { toBoard: ReturnType<typeof vi.fn> }, call = 0): string[] {
      return realtime.toBoard.mock.calls[call][2].map((event: { type: string }) => event.type);
    }

    it('records CARD_CREATED with copies of the card title and list name', async () => {
      const { service, activity } = setup({
        locked: [{ id: LIST, title: 'Yapılacak', archivedAt: null }],
      });

      await service.create(BOARD, LIST, { title: 'Yeni' }, ORIGIN);

      expect(recorded(activity)).toEqual([
        {
          boardId: BOARD,
          cardId: 'new',
          actorId: ORIGIN.actorId,
          type: 'CARD_CREATED',
          data: { cardTitle: 'NEW', list: { id: LIST, title: 'Yapılacak' } },
        },
      ]);
    });

    it('records CARD_MOVED with both list names when the card changes list', async () => {
      const { service, activity } = setup();

      await service.move(BOARD, 'c', { listId: OTHER_LIST }, ORIGIN);

      expect(recorded(activity)).toEqual([
        expect.objectContaining({
          type: 'CARD_MOVED',
          cardId: 'c',
          data: {
            cardTitle: 'Kart',
            fromList: { id: LIST, title: 'Yapılacak' },
            toList: { id: OTHER_LIST, title: 'Bitti' },
          },
        }),
      ]);
    });

    it('records nothing for a move inside one list, and broadcasts only card:moved', async () => {
      const { service, activity, realtime } = setup({
        locked: [{ id: LIST, title: 'Yapılacak', archivedAt: null }],
      });

      await service.move(BOARD, 'c', { listId: LIST, afterCardId: 'a' }, ORIGIN);

      expect(activity.create).not.toHaveBeenCalled();
      expect(types(realtime)).toEqual(['card:moved']);
    });

    it.each([
      ['archives', { archived: true }, { listId: LIST, archivedAt: null }, ['CARD_ARCHIVED']],
      [
        'restores',
        { archived: false },
        { listId: LIST, archivedAt: ARCHIVED_AT },
        ['CARD_RESTORED'],
      ],
      [
        'completes',
        { isCompleted: true },
        { listId: LIST, archivedAt: null, completedAt: null },
        ['CARD_COMPLETED'],
      ],
      [
        'uncompletes',
        { isCompleted: false },
        { listId: LIST, archivedAt: null, completedAt: ARCHIVED_AT },
        ['CARD_UNCOMPLETED'],
      ],
      [
        'restores and completes in one request',
        { archived: false, isCompleted: true },
        { listId: LIST, archivedAt: ARCHIVED_AT, completedAt: null },
        ['CARD_RESTORED', 'CARD_COMPLETED'],
      ],
    ])('%s: one entry per state change', async (_name, input, current, expected) => {
      const { service, activity } = setup({ reads: [current] });

      await service.update(BOARD, 'c', input, ORIGIN);

      expect(recorded(activity).map((entry) => entry.type)).toEqual(expected);
      expect(recorded(activity)[0].data).toEqual({ cardTitle: 'C' });
    });

    it.each([
      ['archiving an archived card', { archived: true }, { listId: LIST, archivedAt: ARCHIVED_AT }],
      [
        'completing a completed card',
        { isCompleted: true },
        { listId: LIST, archivedAt: null, completedAt: ARCHIVED_AT },
      ],
      [
        'uncompleting an open card',
        { isCompleted: false },
        { listId: LIST, archivedAt: null, completedAt: null },
      ],
      ['restoring an active card', { archived: false }, { listId: LIST, archivedAt: null }],
    ])('records nothing for %s, and broadcasts only card:updated', async (_name, input, current) => {
      const { service, activity, realtime } = setup({ reads: [current] });

      await service.update(BOARD, 'c', input, ORIGIN);

      expect(activity.create).not.toHaveBeenCalled();
      expect(types(realtime)).toEqual(['card:updated']);
    });

    it('records nothing for edits that are not state changes', async () => {
      const { service, activity, tx } = setup();

      await service.update(BOARD, 'c', { title: 'Y', description: 'D', coverColor: 'BLUE' }, ORIGIN);

      expect(activity.create).not.toHaveBeenCalled();
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('reads the state under the card lock', async () => {
      const { service, tx, card } = setup();
      const order: string[] = [];
      tx.$queryRaw.mockImplementation(() => {
        order.push('lock');
        return Promise.resolve([{ id: 'c' }]);
      });
      card.findFirst.mockReset();
      card.findFirst.mockImplementation(() => {
        order.push('read');
        return Promise.resolve({ listId: LIST, title: 'Kart', archivedAt: null, completedAt: null });
      });

      await service.update(BOARD, 'c', { isCompleted: true }, ORIGIN);

      expect(order).toEqual(['lock', 'read']);
    });

    it('answers 404 when the card row is gone at the lock', async () => {
      const { service, tx, activity } = setup();
      tx.$queryRaw.mockResolvedValue([]);

      await expect(service.update(BOARD, 'c', { isCompleted: true }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(activity.create).not.toHaveBeenCalled();
    });

    it('broadcasts nothing when the transaction fails', async () => {
      const { service, realtime, card } = setup();
      card.update.mockRejectedValueOnce(new Error('boom'));

      await expect(service.update(BOARD, 'c', { archived: true }, ORIGIN)).rejects.toThrow('boom');
      expect(realtime.toBoard).not.toHaveBeenCalled();
    });
  });

  describe('realtime', () => {
    function types(realtime: { toBoard: ReturnType<typeof vi.fn> }, call = 0): string[] {
      return realtime.toBoard.mock.calls[call][2].map((event: { type: string }) => event.type);
    }

    it('broadcasts card:created once, after the transaction', async () => {
      const { service, realtime, inTransaction } = setup({
        locked: [{ id: LIST, title: 'Yapılacak', archivedAt: null }],
      });

      const created = await service.create(BOARD, LIST, { title: 'Yeni' }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'card:created', data: created },
        expect.objectContaining({ type: 'activity:created' }),
      ]);
    });

    it('puts position:rebalanced of the list in front of card:created', async () => {
      const { service, realtime } = setup({
        locked: [{ id: LIST, title: 'Yapılacak', archivedAt: null }],
        siblings: [
          { id: 'a', position: 1 },
          { id: 'b', position: 1 + 1e-7 },
        ],
      });

      await service.create(BOARD, LIST, { title: 'Yeni', afterCardId: 'a' }, ORIGIN);

      expect(types(realtime)).toEqual(['position:rebalanced', 'card:created', 'activity:created']);
      expect(realtime.toBoard.mock.calls[0][2][0].data).toEqual({
        entity: 'card',
        listId: LIST,
        positions: [
          { id: 'a', position: 1024 },
          { id: 'b', position: 3072 },
        ],
      });
    });

    it('broadcasts nothing when create fails', async () => {
      const { service, realtime } = setup({ locked: [] });

      await expect(service.create(BOARD, LIST, { title: 'X' }, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts card:moved with the list it came from', async () => {
      const { service, realtime, inTransaction } = setup();

      await service.move(BOARD, 'c', { listId: OTHER_LIST, afterCardId: 'a' }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        {
          type: 'card:moved',
          data: { id: 'c', fromListId: LIST, toListId: OTHER_LIST, position: 1536 },
        },
        expect.objectContaining({ type: 'activity:created' }),
      ]);
    });

    it('names the same list twice for a move inside a list', async () => {
      const { service, realtime } = setup({ locked: [{ id: LIST, title: 'Yapılacak', archivedAt: null }] });

      await service.move(BOARD, 'c', { listId: LIST }, ORIGIN);

      expect(realtime.toBoard.mock.calls[0][2][0].data).toMatchObject({
        fromListId: LIST,
        toListId: LIST,
      });
    });

    it('broadcasts position:rebalanced of the target list before card:moved', async () => {
      const { service, realtime } = setup({
        siblings: [
          { id: 'a', position: 1 },
          { id: 'b', position: 1 + 1e-7 },
        ],
      });

      const result = await service.move(
        BOARD,
        'c',
        { listId: OTHER_LIST, afterCardId: 'a' },
        ORIGIN,
      );

      expect(types(realtime)).toEqual(['position:rebalanced', 'card:moved', 'activity:created']);
      expect(realtime.toBoard.mock.calls[0][2][0].data).toMatchObject({
        entity: 'card',
        listId: OTHER_LIST,
      });
      expect(result.rebalanced).toEqual(realtime.toBoard.mock.calls[0][2][0].data);
    });

    it('broadcasts nothing when a move is refused', async () => {
      const { service, realtime } = setup({ reads: [{ listId: LIST, archivedAt: ARCHIVED_AT }] });

      await expect(service.move(BOARD, 'c', { listId: LIST }, ORIGIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts nothing when the transaction rejects', async () => {
      const { service, realtime, prisma } = setup();
      prisma.$transaction.mockRejectedValueOnce(new Error('deadlock'));

      await expect(service.update(BOARD, 'c', { title: 'Y' }, ORIGIN)).rejects.toThrow('deadlock');

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('marks card:updated as descriptionChanged only when a description was sent', async () => {
      const { service, realtime, inTransaction } = setup();

      await service.update(BOARD, 'c', { title: 'Başlık' }, ORIGIN);
      await service.update(BOARD, 'c', { description: null }, ORIGIN);
      await service.update(BOARD, 'c', { description: 'Metin' }, ORIGIN);

      expect(inTransaction.broadcasts).toBe(2);
      const changed = realtime.toBoard.mock.calls.map(
        ([, , events]) => events[0].data.descriptionChanged,
      );
      expect(changed).toEqual([false, true, true]);
    });

    it('never puts the description text into the broadcast', async () => {
      const { service, realtime, card } = setup();
      card.update.mockResolvedValue({ ...row('c', LIST, 1024), description: 'GİZLİ-AÇIKLAMA' });

      const result = await service.update(BOARD, 'c', { description: 'GİZLİ-AÇIKLAMA' }, ORIGIN);

      expect(JSON.stringify(realtime.toBoard.mock.calls)).not.toContain('GİZLİ-AÇIKLAMA');
      expect(result).not.toHaveProperty('description');
      expect(realtime.toBoard.mock.calls[0][2][0].data.card).toMatchObject({
        hasDescription: true,
      });
    });

    it('broadcasts card:updated followed by its activity for an archive and for a restore', async () => {
      const archive = setup();
      const archived = await archive.service.update(BOARD, 'c', { archived: true }, ORIGIN);
      expect(archived.archivedAt).not.toBeNull();
      expect(types(archive.realtime)).toEqual(['card:updated', 'activity:created']);

      const restore = setup({
        reads: [{ listId: LIST, archivedAt: ARCHIVED_AT }],
        locked: [{ id: LIST, title: 'Yapılacak', archivedAt: null }],
      });
      await restore.service.update(BOARD, 'c', { archived: false }, ORIGIN);
      expect(types(restore.realtime)).toEqual(['card:updated', 'activity:created']);
    });

    it('broadcasts card:deleted with the list the card was on', async () => {
      const { service, realtime, card } = setup();

      await service.remove(BOARD, 'c', ORIGIN);

      expect(card.delete).toHaveBeenCalledWith({
        where: { id: 'c', boardId: BOARD },
        select: { listId: true },
      });
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'card:deleted', data: { id: 'c', listId: LIST } },
      ]);
    });

    it('broadcasts nothing and deletes no file when the delete fails', async () => {
      const { service, realtime, card, storage } = setup();
      card.delete.mockRejectedValue(new Error('P2025'));

      await expect(service.remove(BOARD, 'c', ORIGIN)).rejects.toThrow('P2025');

      expect(realtime.toBoard).not.toHaveBeenCalled();
      expect(storage.deleteQuietly).not.toHaveBeenCalled();
    });

    it('collects the files of the card before the delete and removes them after the broadcast', async () => {
      const { service, attachment, card, realtime, storage } = setup();

      await service.remove(BOARD, 'c', ORIGIN);

      expect(attachment.findMany).toHaveBeenCalledWith({
        where: { cardId: 'c', boardId: BOARD },
        select: { storageKey: true },
      });
      expect(storage.deleteQuietly).toHaveBeenCalledWith(['key-1', 'key-2']);
      expect(attachment.findMany.mock.invocationCallOrder[0]).toBeLessThan(
        card.delete.mock.invocationCallOrder[0],
      );
      expect(realtime.toBoard.mock.invocationCallOrder[0]).toBeLessThan(
        storage.deleteQuietly.mock.invocationCallOrder[0],
      );
    });
  });
});
