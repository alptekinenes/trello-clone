import type { FeedItemDto } from '@trello/contracts';

/** Newest first; the id breaks a tie in the same order the database sorts uuids (lower case hex). */
export function compareFeedItems(a: FeedItemDto, b: FeedItemDto): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

export interface MergedFeed {
  items: FeedItemDto[];
  /** True when more items exist than the page holds. */
  hasMore: boolean;
}

/**
 * Merges lists that are each sorted newest first, and keeps the first `limit`.
 * Each source should have been read with `limit + 1` rows, so "more" can be told.
 */
export function mergeFeed(sources: readonly (readonly FeedItemDto[])[], limit: number): MergedFeed {
  const all = sources.flat().sort(compareFeedItems);
  return { items: all.slice(0, limit), hasMore: all.length > limit };
}
