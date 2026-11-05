import { Injectable } from '@nestjs/common';
import type { ActivityDto } from '@trello/contracts';
import { cardNotFound } from '../access/access.errors.js';
import {
  type ActivityEntry,
  activityEvents,
  ActivityService,
} from '../activity/activity.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { notBoardMember } from './card-members.errors.js';

/** Names copied into the log entry; read before the transaction. */
interface Names {
  cardTitle: string;
  memberName: string;
}

/**
 * Board members assigned to cards. Every query is scoped to the board. A change is
 * logged in the same transaction and broadcast after it was saved; an assignment
 * that changes nothing is neither logged nor broadcast.
 * If the card is deleted or the member removed at the same moment, the foreign key
 * fails and the filter answers 409.
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class CardMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly activity: ActivityService,
  ) {}

  async assign(
    boardId: string,
    cardId: string,
    userId: string,
    origin: EventOrigin,
  ): Promise<void> {
    const [card, membership] = await Promise.all([
      this.prisma.card.findFirst({
        where: { id: cardId, boardId },
        select: { id: true, title: true },
      }),
      this.prisma.boardMember.findUnique({
        where: { boardId_userId: { boardId, userId } },
        select: { user: { select: { name: true } } },
      }),
    ]);
    if (!card) throw cardNotFound();
    if (!membership) throw notBoardMember();
    const names = { cardTitle: card.title, memberName: membership.user.name };

    const activities = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.cardMember.createMany({
        data: [{ cardId, boardId, userId }],
        skipDuplicates: true,
      });
      if (count === 0) return null;
      return this.activity.record(tx, { boardId, cardId, actorId: origin.actorId }, [
        entry('CARD_MEMBER_ADDED', userId, names),
      ]);
    });
    if (!activities) return;
    this.realtime.toBoard(boardId, origin, [
      { type: 'card:member-added', data: { cardId, userId } },
      ...activityEvents(activities),
    ]);
  }

  /** Takes the member off the card. Not being assigned is fine. */
  async unassign(
    boardId: string,
    cardId: string,
    userId: string,
    origin: EventOrigin,
  ): Promise<void> {
    const [card, membership] = await Promise.all([
      this.prisma.card.findFirst({
        where: { id: cardId, boardId },
        select: { title: true },
      }),
      this.prisma.boardMember.findUnique({
        where: { boardId_userId: { boardId, userId } },
        select: { user: { select: { name: true } } },
      }),
    ]);

    const activities = await this.prisma.$transaction(async (tx): Promise<ActivityDto[] | null> => {
      const { count } = await tx.cardMember.deleteMany({ where: { cardId, userId, boardId } });
      if (count === 0) return null;
      // An assignment exists, so the card and the member did too; they can only be missing if
      // they vanished since the reads above, and then the removal is still broadcast.
      if (!card || !membership) return [];
      return this.activity.record(tx, { boardId, cardId, actorId: origin.actorId }, [
        entry('CARD_MEMBER_REMOVED', userId, {
          cardTitle: card.title,
          memberName: membership.user.name,
        }),
      ]);
    });
    if (!activities) return;
    this.realtime.toBoard(boardId, origin, [
      { type: 'card:member-removed', data: { cardId, userId } },
      ...activityEvents(activities),
    ]);
  }
}

function entry(
  type: 'CARD_MEMBER_ADDED' | 'CARD_MEMBER_REMOVED',
  userId: string,
  names: Names,
): ActivityEntry {
  return { type, data: { cardTitle: names.cardTitle, member: { id: userId, name: names.memberName } } };
}
