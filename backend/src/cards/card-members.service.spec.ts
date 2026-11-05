import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { CardMembersService } from './card-members.service.js';

const BOARD = 'board-1';
const CARD = 'card-1';
const USER = 'user-2';
const ORIGIN: EventOrigin = { actorId: 'user-1', socketId: 'socket-1' };

function setup({ cardFound = true, memberFound = true, created = 1, deleted = 1 } = {}) {
  const card = {
    findFirst: vi.fn().mockResolvedValue(cardFound ? { id: CARD, title: 'Kart' } : null),
  };
  const boardMember = {
    findUnique: vi.fn().mockResolvedValue(memberFound ? { user: { name: 'Burak' } } : null),
  };
  const cardMember = {
    createMany: vi.fn().mockResolvedValue({ count: created }),
    deleteMany: vi.fn().mockResolvedValue({ count: deleted }),
  };
  const activity = {
    create: vi.fn(({ data }: { data: { cardId: string; actorId: string; type: string; data: unknown } }) =>
      Promise.resolve({
        id: 'activity-1',
        cardId: data.cardId,
        type: data.type,
        data: data.data,
        createdAt: new Date('2026-11-05T10:00:00.000Z'),
        actor: { id: data.actorId, name: 'Ayşe', avatarUrl: null },
      }),
    ),
  };
  const tx = { cardMember, activity };
  const realtime = { toBoard: vi.fn() };
  const prisma = {
    card,
    boardMember,
    cardMember,
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => Promise.resolve(fn(tx))),
  };
  const service = new CardMembersService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
    new ActivityService(),
  );
  return { service, realtime, card, boardMember, cardMember, activity, prisma };
}

describe('CardMembersService', () => {
  it('assigns a board member and broadcasts card:member-added', async () => {
    const { service, realtime, cardMember, boardMember } = setup();

    await service.assign(BOARD, CARD, USER, ORIGIN);

    expect(boardMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { boardId_userId: { boardId: BOARD, userId: USER } } }),
    );
    expect(cardMember.createMany).toHaveBeenCalledWith({
      data: [{ cardId: CARD, boardId: BOARD, userId: USER }],
      skipDuplicates: true,
    });
    expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
      { type: 'card:member-added', data: { cardId: CARD, userId: USER } },
      expect.objectContaining({ type: 'activity:created' }),
    ]);
  });

  it('records CARD_MEMBER_ADDED in the same transaction, with copied names', async () => {
    const { service, activity, prisma } = setup();

    await service.assign(BOARD, CARD, USER, ORIGIN);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          boardId: BOARD,
          cardId: CARD,
          actorId: ORIGIN.actorId,
          type: 'CARD_MEMBER_ADDED',
          data: { cardTitle: 'Kart', member: { id: USER, name: 'Burak' } },
        },
      }),
    );
  });

  it('rejects a user who is not on the board with NOT_BOARD_MEMBER', async () => {
    const { service, realtime, cardMember } = setup({ memberFound: false });

    const error = await service.assign(BOARD, CARD, USER, ORIGIN).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: ErrorCode.NOT_BOARD_MEMBER,
    });
    expect(cardMember.createMany).not.toHaveBeenCalled();
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });

  it('answers not found for a card outside the board', async () => {
    const { service } = setup({ cardFound: false });

    await expect(service.assign(BOARD, CARD, USER, ORIGIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('neither records nor broadcasts when the member was already assigned', async () => {
    const { service, realtime, activity } = setup({ created: 0 });

    await service.assign(BOARD, CARD, USER, ORIGIN);

    expect(activity.create).not.toHaveBeenCalled();
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });

  it('unassigns inside the board and broadcasts card:member-removed', async () => {
    const { service, realtime, cardMember } = setup();

    await service.unassign(BOARD, CARD, USER, ORIGIN);

    expect(cardMember.deleteMany).toHaveBeenCalledWith({
      where: { cardId: CARD, userId: USER, boardId: BOARD },
    });
    expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
      { type: 'card:member-removed', data: { cardId: CARD, userId: USER } },
      expect.objectContaining({ type: 'activity:created' }),
    ]);
  });

  it('records CARD_MEMBER_REMOVED in the same transaction, with copied names', async () => {
    const { service, activity, prisma } = setup();

    await service.unassign(BOARD, CARD, USER, ORIGIN);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CARD_MEMBER_REMOVED',
          data: { cardTitle: 'Kart', member: { id: USER, name: 'Burak' } },
        }),
      }),
    );
  });

  it('neither records nor broadcasts when the member was not assigned', async () => {
    const { service, realtime, activity } = setup({ deleted: 0 });

    await service.unassign(BOARD, CARD, USER, ORIGIN);

    expect(activity.create).not.toHaveBeenCalled();
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });
});
