import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';

/**
 * A user's own card watching. It is private: the change goes only to that user's
 * sockets (their other tabs), never to the board room. Only a real change is sent.
 * Callers check access first (BoardAccessGuard); the user is always the requester.
 */
@Injectable()
export class CardWatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async watch(boardId: string, cardId: string, userId: string, origin: EventOrigin): Promise<void> {
    const { count } = await this.prisma.cardWatch.createMany({
      data: [{ cardId, boardId, userId }],
      skipDuplicates: true,
    });
    if (count === 0) return;
    this.announce(boardId, cardId, userId, origin, true);
  }

  async unwatch(
    boardId: string,
    cardId: string,
    userId: string,
    origin: EventOrigin,
  ): Promise<void> {
    const { count } = await this.prisma.cardWatch.deleteMany({
      where: { cardId, boardId, userId },
    });
    if (count === 0) return;
    this.announce(boardId, cardId, userId, origin, false);
  }

  private announce(
    boardId: string,
    cardId: string,
    userId: string,
    origin: EventOrigin,
    watching: boolean,
  ): void {
    this.realtime.toUsers([userId], boardId, origin, {
      type: 'card:watch-updated',
      data: { cardId, watching },
    });
  }
}
