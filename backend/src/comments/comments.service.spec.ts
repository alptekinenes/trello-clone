import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { CommentsService } from './comments.service.js';

const BOARD = 'board-1';
const CARD = 'card-1';
const COMMENT = 'comment-1';
const AUTHOR = 'user-1';
const OTHER = 'user-2';
const ORIGIN: EventOrigin = { actorId: AUTHOR, socketId: 'socket-1' };

function commentRow(authorId = AUTHOR, editedAt: Date | null = null) {
  return {
    id: COMMENT,
    cardId: CARD,
    body: 'Merhaba',
    createdAt: new Date('2026-11-05T10:00:00.000Z'),
    editedAt,
    author: { id: authorId, name: 'Ayşe', avatarUrl: null },
  };
}

function setup({
  existing = { authorId: AUTHOR, cardId: CARD } as { authorId: string; cardId: string } | null,
  deleted = 1,
  commentCount = 3,
} = {}) {
  const calls: string[] = [];
  const card = {
    update: vi.fn(() => {
      calls.push('card.update');
      return Promise.resolve({ commentCount });
    }),
  };
  const comment = {
    create: vi.fn(() => {
      calls.push('comment.create');
      return Promise.resolve(commentRow());
    }),
    findFirst: vi.fn().mockResolvedValue(existing),
    update: vi.fn().mockResolvedValue(commentRow(AUTHOR, new Date('2026-11-05T11:00:00.000Z'))),
    deleteMany: vi.fn(() => {
      calls.push('comment.deleteMany');
      return Promise.resolve({ count: deleted });
    }),
  };
  const tx = { card, comment };
  let broadcastsAtCommit = -1;
  const realtime = { toBoard: vi.fn() };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => {
      const result = await fn(tx);
      broadcastsAtCommit = realtime.toBoard.mock.calls.length;
      return result;
    }),
  };
  const service = new CommentsService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
  );
  return { service, card, comment, realtime, calls, broadcastsAtCommit: () => broadcastsAtCommit };
}

describe('CommentsService.create', () => {
  it('raises the counter before it inserts, in one transaction', async () => {
    const { service, card, comment, calls } = setup();

    await service.create(BOARD, CARD, AUTHOR, { body: 'Merhaba' }, ORIGIN);

    expect(card.update).toHaveBeenCalledWith({
      where: { id: CARD, boardId: BOARD },
      data: { commentCount: { increment: 1 } },
      select: { commentCount: true },
    });
    expect(comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { cardId: CARD, boardId: BOARD, authorId: AUTHOR, body: 'Merhaba' },
      }),
    );
    expect(calls).toEqual(['card.update', 'comment.create']);
  });

  it('returns the comment and broadcasts it with the new count, after the commit', async () => {
    const { service, realtime, broadcastsAtCommit } = setup({ commentCount: 4 });

    const result = await service.create(BOARD, CARD, AUTHOR, { body: 'Merhaba' }, ORIGIN);

    expect(result).toMatchObject({ kind: 'comment', id: COMMENT, body: 'Merhaba', editedAt: null });
    expect(realtime.toBoard).toHaveBeenCalledOnce();
    expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
      { type: 'comment:created', data: { comment: result, commentCount: 4 } },
    ]);
    expect(broadcastsAtCommit()).toBe(0);
  });

  it('broadcasts nothing when the transaction fails', async () => {
    const { service, comment, realtime } = setup();
    comment.create.mockRejectedValueOnce(new Error('db down'));

    await expect(service.create(BOARD, CARD, AUTHOR, { body: 'x' }, ORIGIN)).rejects.toThrow(
      'db down',
    );
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });
});

describe('CommentsService.update', () => {
  it('lets the author edit and sets editedAt', async () => {
    const { service, comment, realtime } = setup();

    const result = await service.update(BOARD, COMMENT, AUTHOR, { body: 'Yeni' }, ORIGIN);

    expect(comment.update).toHaveBeenCalledWith({
      where: { id: COMMENT, boardId: BOARD },
      data: { body: 'Yeni', editedAt: expect.any(Date) },
      select: expect.any(Object),
    });
    expect(result.editedAt).toBe('2026-11-05T11:00:00.000Z');
    expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
      { type: 'comment:updated', data: result },
    ]);
  });

  it('refuses everyone but the author with 403, whatever their role', async () => {
    const { service, comment, realtime } = setup();

    const error = await service
      .update(BOARD, COMMENT, OTHER, { body: 'Yeni' }, ORIGIN)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
    expect(comment.update).not.toHaveBeenCalled();
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });

  it('answers 404 for a comment outside the board', async () => {
    const { service, comment } = setup({ existing: null });

    await expect(
      service.update(BOARD, COMMENT, AUTHOR, { body: 'x' }, ORIGIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(comment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COMMENT, boardId: BOARD } }),
    );
  });
});

describe('CommentsService.remove', () => {
  it('lets the author delete and lowers the counter', async () => {
    const { service, card, realtime } = setup({ commentCount: 2 });

    await service.remove(BOARD, COMMENT, { userId: AUTHOR, role: 'MEMBER' }, ORIGIN);

    expect(card.update).toHaveBeenCalledWith({
      where: { id: CARD, boardId: BOARD },
      data: { commentCount: { decrement: 1 } },
      select: { commentCount: true },
    });
    expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
      { type: 'comment:deleted', data: { id: COMMENT, cardId: CARD, commentCount: 2 } },
    ]);
  });

  it('locks the card row before the comment row, in the order card deletion cascades', async () => {
    const { service, calls } = setup();

    await service.remove(BOARD, COMMENT, { userId: AUTHOR, role: 'MEMBER' }, ORIGIN);

    expect(calls).toEqual(['card.update', 'comment.deleteMany']);
  });

  it.each(['ADMIN', 'OWNER'] as const)('lets an %s delete another comment', async (role) => {
    const { service, comment } = setup();

    await service.remove(BOARD, COMMENT, { userId: OTHER, role }, ORIGIN);

    expect(comment.deleteMany).toHaveBeenCalledOnce();
  });

  it('refuses a MEMBER who is not the author with 403 and changes nothing', async () => {
    const { service, comment, card, realtime } = setup();

    await expect(
      service.remove(BOARD, COMMENT, { userId: OTHER, role: 'MEMBER' }, ORIGIN),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(comment.deleteMany).not.toHaveBeenCalled();
    expect(card.update).not.toHaveBeenCalled();
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });

  it('answers 404 from inside the transaction when another request deleted it first, so the lowered counter rolls back', async () => {
    const { service, realtime, calls, broadcastsAtCommit } = setup({ deleted: 0 });

    await expect(
      service.remove(BOARD, COMMENT, { userId: AUTHOR, role: 'MEMBER' }, ORIGIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(calls).toEqual(['card.update', 'comment.deleteMany']);
    expect(broadcastsAtCommit()).toBe(-1);
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });

  it('answers 404 for a comment that does not exist', async () => {
    const { service, comment } = setup({ existing: null });

    await expect(
      service.remove(BOARD, COMMENT, { userId: AUTHOR, role: 'OWNER' }, ORIGIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(comment.deleteMany).not.toHaveBeenCalled();
  });

  it('broadcasts after the commit', async () => {
    const { service, broadcastsAtCommit } = setup();

    await service.remove(BOARD, COMMENT, { userId: AUTHOR, role: 'MEMBER' }, ORIGIN);

    expect(broadcastsAtCommit()).toBe(0);
  });
});
