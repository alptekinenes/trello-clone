import type { BoardEvent } from '@trello/contracts';
import { insertItem, removeItem, replaceItem, type FeedData } from './feed-cache';

/**
 * Applies an event from another user to the cached feed of a card. Pure and idempotent;
 * anything that is not news for this feed gives back the same object.
 * Activities only belong to the feed that shows details.
 */
export function applyFeedEvent(
  data: FeedData,
  event: BoardEvent,
  cardId: string,
  details: boolean,
): FeedData {
  switch (event.type) {
    case 'comment:created':
      return event.data.comment.cardId === cardId ? insertItem(data, event.data.comment) : data;
    case 'comment:updated':
      return event.data.cardId === cardId ? replaceItem(data, event.data.id, event.data) : data;
    case 'comment:deleted':
      return event.data.cardId === cardId ? removeItem(data, event.data.id) : data;
    case 'activity:created':
      return details && event.data.cardId === cardId ? insertItem(data, event.data) : data;
    default:
      return data;
  }
}
