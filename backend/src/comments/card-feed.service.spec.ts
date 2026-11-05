import { BadRequestException } from '@nestjs/common';
import { FEED_LIMITS } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CardFeedService } from './card-feed.service.js';
import { decodeFeedCursor, encodeFeedCursor } from './feed-cursor.js';

const BOARD = 'board-1';
const CARD = 'card-1';
const ID = '3f2b8a54-5c1d-4a7e-9a3b-0c6f1d2e4b5a';
const USER = { id: 'u1', name: 'Ayşe', avatarUrl: null };

function commentRow(id: string, createdAt: string) {
  return {
    id,
    cardId: CARD,
    body: id,
    createdAt: new Date(createdAt),
    editedAt: null,
    author: USER,
  };
}

function activityRow(id: string, createdAt: string) {
  return {
    id,
    cardId: CARD,
    type: 'CARD_ARCHIVED',
    data: { cardTitle: 'Kart' },
    createdAt: new Date(createdAt),
    actor: USER,
  };
}

function setup(comments: unknown[] = [], activities: unknown[] = []) {
  const prisma = {
    comment: { findMany: vi.fn().mockResolvedValue(comments) },
    activity: { findMany: vi.fn().mockResolvedValue(activities) },
  };
  return { prisma, service: new CardFeedService(prisma as unknown as PrismaService) };
}

describe('CardFeedService', () => {
  it('reads only comments when details are off', async () => {
    const { service, prisma } = setup([commentRow('c1', '2026-11-05T10:00:00.000Z')]);

    const page = await service.getPage(BOARD, CARD, { details: false });

    expect(prisma.activity.findMany).not.toHaveBeenCalled();
    expect(page.items.map((i) => i.kind)).toEqual(['comment']);
    expect(page.nextCursor).toBeNull();
  });

  it('merges comments and activity newest first when details are on', async () => {
    const { service } = setup(
      [commentRow('c1', '2026-11-05T10:00:00.000Z')],
      [activityRow('a1', '2026-11-05T10:01:00.000Z')],
    );

    const page = await service.getPage(BOARD, CARD, { details: true });

    expect(page.items.map((i) => i.id)).toEqual(['a1', 'c1']);
  });

  it('reads limit + 1 rows per table, scoped to the card and board, with the default limit', async () => {
    const { service, prisma } = setup();

    await service.getPage(BOARD, CARD, { details: true });

    const expected = expect.objectContaining({
      take: FEED_LIMITS.PAGE_DEFAULT + 1,
      where: { cardId: CARD, boardId: BOARD },
    });
    expect(prisma.comment.findMany).toHaveBeenCalledWith(expected);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(expected);
  });

  it('returns a cursor for the last item when more rows exist', async () => {
    const { service } = setup([
      commentRow('c3', '2026-11-05T10:03:00.000Z'),
      commentRow('c2', '2026-11-05T10:02:00.000Z'),
      commentRow('c1', '2026-11-05T10:01:00.000Z'),
    ]);

    const page = await service.getPage(BOARD, CARD, { details: false, limit: 2 });

    expect(page.items.map((i) => i.id)).toEqual(['c3', 'c2']);
    expect(page.nextCursor).not.toBeNull();
  });

  it('puts the cursor condition into both queries', async () => {
    const { service, prisma } = setup();
    const createdAt = new Date('2026-11-05T10:00:00.000Z');
    const cursor = encodeFeedCursor({ createdAt, id: ID });
    expect(decodeFeedCursor(cursor)).toEqual({ createdAt, id: ID });

    await service.getPage(BOARD, CARD, { details: true, cursor });

    const where = {
      cardId: CARD,
      boardId: BOARD,
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: ID } }],
    };
    expect(prisma.comment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(prisma.activity.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it('rejects a cursor it did not make with 400', async () => {
    const { service, prisma } = setup();

    await expect(
      service.getPage(BOARD, CARD, { details: false, cursor: 'nonsense' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.comment.findMany).not.toHaveBeenCalled();
  });
});
