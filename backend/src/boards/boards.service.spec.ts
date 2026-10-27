import type { PrismaService } from '../prisma/prisma.service.js';
import { BOARD_SELECT, DEFAULT_LABEL_COLORS, toBoardSummary } from './board.mapper.js';
import { BoardsService } from './boards.service.js';

const UPDATED_AT = new Date('2026-10-27T09:00:00.000Z');
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
  const boardMember = {
    findMany: vi.fn().mockResolvedValue([{ role: 'MEMBER', board: BOARD }]),
  };
  const service = new BoardsService({ board, boardMember } as unknown as PrismaService);
  return { service, board, boardMember };
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

    const result = await service.create('user-1', { title: 'Proje', background: 'green' });

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

  it('getDetail returns the board, members and labels', async () => {
    const { service } = setup();

    await expect(service.getDetail('board-1', 'ADMIN')).resolves.toEqual({
      board: { ...SUMMARY, myRole: 'ADMIN' },
      members: [],
      labels: [{ id: 'label-1', boardId: 'board-1', name: '', color: 'GREEN' }],
      lists: [{ id: 'list-1', boardId: 'board-1', title: 'Yapılacaklar', position: 1024, archivedAt: null }],
    });
  });

  it('update writes only title and background', async () => {
    const { service, board } = setup();

    await service.update('board-1', 'OWNER', { title: 'Yeni' });

    expect(board.update).toHaveBeenCalledWith({
      where: { id: 'board-1' },
      data: { title: 'Yeni', background: undefined },
      select: BOARD_SELECT,
    });
  });

  it('remove deletes the board', async () => {
    const { service, board } = setup();
    await service.remove('board-1');
    expect(board.delete).toHaveBeenCalledWith({ where: { id: 'board-1' } });
  });
});

describe('toBoardSummary', () => {
  it('falls back to blue for an unknown stored background', () => {
    expect(toBoardSummary({ ...BOARD, background: 'neon' }, 'OWNER').background).toBe('blue');
  });
});
