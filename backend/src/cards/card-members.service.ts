import { Injectable } from '@nestjs/common';
import { cardNotFound } from '../access/access.errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { notBoardMember } from './card-members.errors.js';

/**
 * Board members assigned to cards. Every query is scoped to the board. A change is
 * broadcast after it was saved; an assignment that changes nothing is not.
 * If the card is deleted or the member removed at the same moment, the foreign key
 * fails and the filter answers 409.
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class CardMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async assign(
    boardId: string,
    cardId: string,
    userId: string,
    origin: EventOrigin,
  ): Promise<void> {
    const [card, membership] = await Promise.all([
      this.prisma.card.findFirst({ where: { id: cardId, boardId }, select: { id: true } }),
      this.prisma.boardMember.findUnique({
        where: { boardId_userId: { boardId, userId } },
        select: { userId: true },
      }),
    ]);
    if (!card) throw cardNotFound();
    if (!membership) throw notBoardMember();
    const { count } = await this.prisma.cardMember.createMany({
      data: [{ cardId, boardId, userId }],
      skipDuplicates: true,
    });
    if (count === 0) return;
    this.realtime.toBoard(boardId, origin, [
      { type: 'card:member-added', data: { cardId, userId } },
    ]);
  }

  /** Takes the member off the card. Not being assigned is fine. */
  async unassign(
    boardId: string,
    cardId: string,
    userId: string,
    origin: EventOrigin,
  ): Promise<void> {
    const { count } = await this.prisma.cardMember.deleteMany({
      where: { cardId, userId, boardId },
    });
    if (count === 0) return;
    this.realtime.toBoard(boardId, origin, [
      { type: 'card:member-removed', data: { cardId, userId } },
    ]);
  }
}
