import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { CardMembersService } from './card-members.service.js';

const BOARD = 'board-1';
const CARD = 'card-1';
const USER = 'user-2';
const ORIGIN: EventOrigin = { actorId: 'user-1', socketId: 'socket-1' };

function setup({ cardFound = true, memberFound = true, created = 1, deleted = 1 } = {}) {
  const card = { findFirst: vi.fn().mockResolvedValue(cardFound ? { id: CARD } : null) };
  const boardMember = {
    findUnique: vi.fn().mockResolvedValue(memberFound ? { userId: USER } : null),
  };
  const cardMember = {
    createMany: vi.fn().mockResolvedValue({ count: created }),
    deleteMany: vi.fn().mockResolvedValue({ count: deleted }),
  };
  const realtime = { toBoard: vi.fn() };
  const service = new CardMembersService(
    { card, boardMember, cardMember } as unknown as PrismaService,
    realtime as unknown as RealtimeService,
  );
  return { service, realtime, card, boardMember, cardMember };
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
    ]);
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

  it('does not broadcast when the member was already assigned', async () => {
    const { service, realtime } = setup({ created: 0 });

    await service.assign(BOARD, CARD, USER, ORIGIN);

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
    ]);
  });

  it('does not broadcast when the member was not assigned', async () => {
    const { service, realtime } = setup({ deleted: 0 });

    await service.unassign(BOARD, CARD, USER, ORIGIN);

    expect(realtime.toBoard).not.toHaveBeenCalled();
  });
});
