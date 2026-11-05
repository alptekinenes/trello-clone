import { Injectable, Logger } from '@nestjs/common';
import { type ActivityDto, type CardFeedPageDto, FEED_LIMITS } from '@trello/contracts';
import { ACTIVITY_SELECT, type ActivityRow, toActivityDto } from '../activity/activity.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { COMMENT_SELECT, toCommentDto } from './comment.mapper.js';
import { badCursor } from './comments.errors.js';
import { decodeFeedCursor, encodeFeedCursor, type FeedCursor } from './feed-cursor.js';
import { mergeFeed } from './merge-feed.js';

export interface FeedRequest {
  details: boolean;
  cursor?: string;
  limit?: number;
}

/** Rows strictly after the cursor in (createdAt desc, id desc) order; the same condition for both tables. */
function afterCursor(cursor: FeedCursor | null) {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

const FEED_ORDER = [{ createdAt: 'desc' }, { id: 'desc' }] as const;

/**
 * One time-ordered page of a card's comments, with its activity when `details` is on.
 * Each table is read `limit + 1` rows deep and the two are merged here, so one cursor
 * keeps the order right across pages. Authors and actors come with the rows (no N+1).
 * Callers check board access first (BoardAccessGuard).
 */
@Injectable()
export class CardFeedService {
  private readonly logger = new Logger(CardFeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** One unreadable row (e.g. a type this build does not know) is logged and left out, not a 500 for the page. */
  private readableActivities(rows: ActivityRow[]): ActivityDto[] {
    return rows.flatMap((row) => {
      try {
        return [toActivityDto(row)];
      } catch {
        this.logger.warn(`Left out activity ${row.id}: unreadable shape`);
        return [];
      }
    });
  }

  async getPage(boardId: string, cardId: string, request: FeedRequest): Promise<CardFeedPageDto> {
    const cursor = request.cursor ? decodeFeedCursor(request.cursor) : null;
    if (request.cursor && !cursor) throw badCursor();
    const limit = request.limit ?? FEED_LIMITS.PAGE_DEFAULT;
    const where = { cardId, boardId, ...afterCursor(cursor) };

    const [comments, activities] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: [...FEED_ORDER],
        take: limit + 1,
        select: COMMENT_SELECT,
      }),
      request.details
        ? this.prisma.activity.findMany({
            where,
            orderBy: [...FEED_ORDER],
            take: limit + 1,
            select: ACTIVITY_SELECT,
          })
        : Promise.resolve([]),
    ]);

    const { items, hasMore } = mergeFeed(
      [comments.map(toCommentDto), this.readableActivities(activities)],
      limit,
    );
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeFeedCursor({ createdAt: new Date(last.createdAt), id: last.id })
          : null,
    };
  }
}
