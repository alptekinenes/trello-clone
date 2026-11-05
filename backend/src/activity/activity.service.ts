import { Injectable } from '@nestjs/common';
import type { ActivityDataMap, ActivityDto, ActivityType, BoardEvent } from '@trello/contracts';
import type { Prisma } from '../generated/prisma/client.js';
import { ACTIVITY_SELECT, toActivityDto } from './activity.mapper.js';

/** One log entry; `data` must match its type (see ActivityDataMap). */
export type ActivityEntry = {
  [T in ActivityType]: { type: T; data: ActivityDataMap[T] };
}[ActivityType];

export interface ActivityRef {
  boardId: string;
  cardId: string;
  actorId: string;
}

/**
 * The only writer of the activity log. It runs inside the transaction of the change
 * it describes, so a rolled back change leaves no entry. Broadcasting the returned
 * entries (`activity:created`) is up to the caller, after the commit.
 */
@Injectable()
export class ActivityService {
  /** Writes the entries in order and returns them ready to broadcast. No entries, no query. */
  async record(
    tx: Prisma.TransactionClient,
    ref: ActivityRef,
    entries: readonly ActivityEntry[],
  ): Promise<ActivityDto[]> {
    const recorded: ActivityDto[] = [];
    for (const entry of entries) {
      const row = await tx.activity.create({
        data: {
          boardId: ref.boardId,
          cardId: ref.cardId,
          actorId: ref.actorId,
          type: entry.type,
          // The data types are interfaces, which TypeScript does not see as JSON objects.
          data: entry.data as unknown as Prisma.InputJsonObject,
        },
        select: ACTIVITY_SELECT,
      });
      recorded.push(toActivityDto(row));
    }
    return recorded;
  }
}

/** The `activity:created` events for recorded entries; put them after the events of the change itself. */
export function activityEvents(activities: readonly ActivityDto[]): BoardEvent[] {
  return activities.map((activity) => ({ type: 'activity:created', data: activity }));
}
