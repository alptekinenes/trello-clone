import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { BoardAccessService } from './board-access.service.js';

const BOARD_ID = '6f1c3c1e-7a51-4b8a-9d55-0f3a3e1d2c4b';

function setup(role: string | null) {
  const findUnique = vi.fn().mockResolvedValue(role ? { role } : null);
  const service = new BoardAccessService({
    boardMember: { findUnique },
  } as unknown as PrismaService);
  return { service, findUnique };
}

describe('BoardAccessService', () => {
  it('looks up the membership by board and user', async () => {
    const { service, findUnique } = setup('ADMIN');

    await expect(service.getRole(BOARD_ID, 'user-1')).resolves.toBe('ADMIN');
    expect(findUnique).toHaveBeenCalledWith({
      where: { boardId_userId: { boardId: BOARD_ID, userId: 'user-1' } },
      select: { role: true },
    });
  });

  it('does not query the database for a malformed board id', async () => {
    const { service, findUnique } = setup('OWNER');

    await expect(service.getRole('not-a-uuid', 'user-1')).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns the role when it is high enough', async () => {
    const { service } = setup('OWNER');
    await expect(service.requireRole(BOARD_ID, 'user-1', 'ADMIN')).resolves.toBe('OWNER');
  });

  it('throws 404 for non-members', async () => {
    const { service } = setup(null);
    await expect(service.requireRole(BOARD_ID, 'user-1', 'MEMBER')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 403 when the role is too low', async () => {
    const { service } = setup('MEMBER');
    await expect(service.requireRole(BOARD_ID, 'user-1', 'ADMIN')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('BoardAccessService lists', () => {
  it('finds the board of a list', async () => {
    const findUnique = vi.fn().mockResolvedValue({ boardId: BOARD_ID });
    const service = new BoardAccessService({ list: { findUnique } } as unknown as PrismaService);

    await expect(service.boardIdOfList(BOARD_ID)).resolves.toBe(BOARD_ID);
    await expect(service.boardIdOfList('not-a-uuid')).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it('finds the board of a card', async () => {
    const findUnique = vi.fn().mockResolvedValue({ boardId: BOARD_ID });
    const service = new BoardAccessService({ card: { findUnique } } as unknown as PrismaService);

    await expect(service.boardIdOfCard(BOARD_ID)).resolves.toBe(BOARD_ID);
    await expect(service.boardIdOfCard('not-a-uuid')).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: BOARD_ID }, select: { boardId: true } });
  });

  it('finds the board of a label', async () => {
    const findUnique = vi.fn().mockResolvedValue({ boardId: BOARD_ID });
    const service = new BoardAccessService({ label: { findUnique } } as unknown as PrismaService);

    await expect(service.boardIdOfLabel(BOARD_ID)).resolves.toBe(BOARD_ID);
    await expect(service.boardIdOfLabel('not-a-uuid')).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledOnce();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: BOARD_ID }, select: { boardId: true } });
  });

  it('finds the board of a comment', async () => {
    const findUnique = vi.fn().mockResolvedValue({ boardId: BOARD_ID });
    const service = new BoardAccessService({ comment: { findUnique } } as unknown as PrismaService);

    await expect(service.boardIdOfComment(BOARD_ID)).resolves.toBe(BOARD_ID);
    await expect(service.boardIdOfComment('not-a-uuid')).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledOnce();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: BOARD_ID }, select: { boardId: true } });
  });

  it('returns null for a comment that does not exist', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const service = new BoardAccessService({ comment: { findUnique } } as unknown as PrismaService);

    await expect(service.boardIdOfComment(BOARD_ID)).resolves.toBeNull();
  });

  it('finds the board of a checklist through its card', async () => {
    const findUnique = vi.fn().mockResolvedValue({ card: { boardId: BOARD_ID } });
    const service = new BoardAccessService({
      checklist: { findUnique },
    } as unknown as PrismaService);

    await expect(service.boardIdOfChecklist(BOARD_ID)).resolves.toBe(BOARD_ID);
    await expect(service.boardIdOfChecklist('not-a-uuid')).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it('finds the board of a checklist item through its checklist and card', async () => {
    const findUnique = vi.fn().mockResolvedValue({ checklist: { card: { boardId: BOARD_ID } } });
    const service = new BoardAccessService({
      checklistItem: { findUnique },
    } as unknown as PrismaService);

    await expect(service.boardIdOfChecklistItem(BOARD_ID)).resolves.toBe(BOARD_ID);
    await expect(service.boardIdOfChecklistItem('not-a-uuid')).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it('returns null for a label, checklist or item that does not exist', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const service = new BoardAccessService({
      label: { findUnique },
      checklist: { findUnique },
      checklistItem: { findUnique },
    } as unknown as PrismaService);

    await expect(service.boardIdOfLabel(BOARD_ID)).resolves.toBeNull();
    await expect(service.boardIdOfChecklist(BOARD_ID)).resolves.toBeNull();
    await expect(service.boardIdOfChecklistItem(BOARD_ID)).resolves.toBeNull();
  });

  it('throws the given not-found error when there is no board', async () => {
    const { service, findUnique } = setup('OWNER');
    const notFound = () => new NotFoundException('List not found');

    await expect(service.requireRole(null, 'user-1', 'MEMBER', notFound)).rejects.toThrow(
      'List not found',
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
