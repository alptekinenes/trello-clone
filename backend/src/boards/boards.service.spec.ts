import { NotFoundException } from '@nestjs/common';
import { toCardSummary } from '../cards/card.mapper.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { BOARD_SELECT, DEFAULT_LABEL_COLORS, toBoardSummary } from './board.mapper.js';
import { BoardsService } from './boards.service.js';

const ORIGIN: EventOrigin = { actorId: 'user-1', socketId: 'socket-1' };
const UPDATED_AT = new Date('2026-10-27T09:00:00.000Z');
const CARD_ROW = {
  id: 'card-1',
  listId: 'list-1',
  title: 'Taslak',
  position: 1024,
  dueDate: null,
  dueComplete: false,
  completedAt: null,
  coverColor: null,
  archivedAt: null,
  commentCount: 0,
  attachmentCount: 0,
  coverAttachmentId: null,
  labels: [],
  members: [],
  checklists: [],
};
const BOARD = { id: 'board-1', title: 'Proje', background: 'green', updatedAt: UPDATED_AT };

function setup() {
  const board = {
    create: vi.fn().mockResolvedValue(BOARD),
    update: vi.fn().mockResolvedValue(BOARD),
    delete: vi.fn().mockResolvedValue(BOARD),
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      ...BOARD,
      members: [],
      labels: [{ id: 'label-1', boardId: 'board-1', name: '', color: 'GREEN' }],
      lists: [{ id: 'list-1', boardId: 'board-1', title: 'Yapılacaklar', position: 1024, archivedAt: null }],
    }),
  };
  const card = {
    findMany: vi
      .fn()
      .mockResolvedValueOnce([CARD_ROW])
      .mockResolvedValueOnce([{ id: 'card-1' }]),
  };
  const cardWatch = { findMany: vi.fn().mockResolvedValue([{ cardId: 'card-1' }]) };
  const boardMember = {
    findMany: vi.fn().mockResolvedValue([{ role: 'MEMBER', board: BOARD }]),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'board-1' }]),
    boardMember: { findMany: vi.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]) },
    board: { delete: vi.fn().mockResolvedValue(BOARD) },
  };
  const realtime = { toBoard: vi.fn(), toUsers: vi.fn(), closeBoardRoom: vi.fn() };
  // How many broadcasts had been made when the transaction callback returned.
  const inTransaction = { broadcasts: -1 };
  const transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => {
    const result = await fn(tx);
    inTransaction.broadcasts =
      realtime.toBoard.mock.calls.length +
      realtime.toUsers.mock.calls.length +
      realtime.closeBoardRoom.mock.calls.length;
    return result;
  });
  const prisma = { board, boardMember, card, cardWatch, $transaction: transaction };
  const service = new BoardsService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
  );
  return { service, realtime, inTransaction, tx, transaction, board, boardMember, card, cardWatch };
}

const SUMMARY = {
  id: 'board-1',
  title: 'Proje',
  background: 'green',
  updatedAt: '2026-10-27T09:00:00.000Z',
};

describe('BoardsService', () => {
  it('create makes the creator the owner and adds the default labels', async () => {
    const { service, board } = setup();

    const result = await service.create('user-1', { title: 'Proje', background: 'green' }, ORIGIN);

    expect(result).toEqual({ ...SUMMARY, myRole: 'OWNER' });
    expect(board.create).toHaveBeenCalledWith({
      data: {
        title: 'Proje',
        background: 'green',
        members: { create: { userId: 'user-1', role: 'OWNER' } },
        labels: { createMany: { data: DEFAULT_LABEL_COLORS.map((color) => ({ color })) } },
      },
      select: BOARD_SELECT,
    });
    expect(DEFAULT_LABEL_COLORS).toHaveLength(6);
  });

  it('listForUser returns each board with the user role', async () => {
    const { service, boardMember } = setup();

    await expect(service.listForUser('user-1')).resolves.toEqual([
      { ...SUMMARY, myRole: 'MEMBER' },
    ]);
    expect(boardMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('getDetail returns the board, members, labels, lists and cards', async () => {
    const { service } = setup();

    await expect(service.getDetail('board-1', 'user-1', 'ADMIN')).resolves.toEqual({
      board: { ...SUMMARY, myRole: 'ADMIN' },
      members: [],
      labels: [{ id: 'label-1', boardId: 'board-1', name: '', color: 'GREEN' }],
      lists: [{ id: 'list-1', boardId: 'board-1', title: 'Yapılacaklar', position: 1024, archivedAt: null }],
      cards: [toCardSummary(CARD_ROW, true)],
      myWatchedCardIds: ['card-1'],
    });
  });

  it('getDetail reads only the watches of the requesting user on this board', async () => {
    const { service, cardWatch } = setup();

    await service.getDetail('board-1', 'user-1', 'MEMBER');

    expect(cardWatch.findMany).toHaveBeenCalledWith({
      where: { boardId: 'board-1', userId: 'user-1' },
      select: { cardId: true },
    });
  });

  it('getDetail loads only active cards on active lists', async () => {
    const { service, board, card } = setup();

    await service.getDetail('board-1', 'user-1', 'MEMBER');

    expect(board.findUniqueOrThrow.mock.calls[0][0].select).not.toHaveProperty('cards');
    const query = card.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      boardId: 'board-1',
      archivedAt: null,
      list: { archivedAt: null },
    });
    expect(query.orderBy).toEqual([{ position: 'asc' }, { id: 'asc' }]);
    expect(query.select).not.toHaveProperty('description');
  });

  it('update writes only title and background', async () => {
    const { service, board } = setup();

    await service.update('board-1', 'OWNER', { title: 'Yeni' }, ORIGIN);

    expect(board.update).toHaveBeenCalledWith({
      where: { id: 'board-1' },
      data: { title: 'Yeni', background: undefined },
      select: BOARD_SELECT,
    });
  });

  it('remove locks the board, then deletes it', async () => {
    const { service, tx } = setup();

    await service.remove('board-1', ORIGIN);

    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.boardMember.findMany.mock.invocationCallOrder[0],
    );
    expect(tx.boardMember.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.board.delete.mock.invocationCallOrder[0],
    );
    expect(tx.board.delete).toHaveBeenCalledWith({ where: { id: 'board-1' } });
  });

  it('remove answers 404 when the board is gone', async () => {
    const { service, tx, realtime } = setup();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(service.remove('board-1', ORIGIN)).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.board.delete).not.toHaveBeenCalled();
    expect(realtime.toUsers).not.toHaveBeenCalled();
    expect(realtime.closeBoardRoom).not.toHaveBeenCalled();
  });

  describe('realtime', () => {
    it('create tells the creator\'s other tabs with the creator\'s own summary', async () => {
      const { service, realtime } = setup();

      const summary = await service.create('user-1', { title: 'Proje' }, ORIGIN);

      expect(realtime.toUsers).toHaveBeenCalledOnce();
      expect(realtime.toUsers).toHaveBeenCalledWith(['user-1'], 'board-1', ORIGIN, {
        type: 'membership:added',
        data: summary,
      });
      expect(summary.myRole).toBe('OWNER');
    });

    it('create broadcasts nothing when the write fails', async () => {
      const { service, realtime, board } = setup();
      board.create.mockRejectedValue(new Error('boom'));

      await expect(service.create('user-1', { title: 'Proje' }, ORIGIN)).rejects.toThrow('boom');

      expect(realtime.toUsers).not.toHaveBeenCalled();
    });

    it('update broadcasts board:updated without any role', async () => {
      const { service, realtime } = setup();

      await service.update('board-1', 'OWNER', { title: 'Yeni' }, ORIGIN);

      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith('board-1', ORIGIN, [
        { type: 'board:updated', data: SUMMARY },
      ]);
      expect(JSON.stringify(realtime.toBoard.mock.calls)).not.toContain('myRole');
    });

    it('update broadcasts nothing when the write fails', async () => {
      const { service, realtime, board } = setup();
      board.update.mockRejectedValue(new Error('boom'));

      await expect(service.update('board-1', 'OWNER', {}, ORIGIN)).rejects.toThrow('boom');

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('remove tells the members as they were at deletion, then empties the room, after the transaction', async () => {
      const { service, realtime, inTransaction } = setup();

      await service.remove('board-1', ORIGIN);

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toUsers).toHaveBeenCalledOnce();
      expect(realtime.toUsers).toHaveBeenCalledWith(['u1', 'u2'], 'board-1', ORIGIN, {
        type: 'board:deleted',
        data: { boardId: 'board-1' },
      });
      expect(realtime.closeBoardRoom).toHaveBeenCalledWith('board-1');
      expect(realtime.toUsers.mock.invocationCallOrder[0]).toBeLessThan(
        realtime.closeBoardRoom.mock.invocationCallOrder[0],
      );
    });

    it('remove broadcasts nothing when the transaction rejects', async () => {
      const { service, realtime, transaction } = setup();
      transaction.mockRejectedValueOnce(new Error('deadlock'));

      await expect(service.remove('board-1', ORIGIN)).rejects.toThrow('deadlock');

      expect(realtime.toUsers).not.toHaveBeenCalled();
      expect(realtime.closeBoardRoom).not.toHaveBeenCalled();
    });
  });
});

describe('toBoardSummary', () => {
  it('falls back to blue for an unknown stored background', () => {
    expect(toBoardSummary({ ...BOARD, background: 'neon' }, 'OWNER').background).toBe('blue');
  });
});
