import type { CardFeedPageDto, CommentDto, FeedItemDto } from '@trello/contracts';
import type { InfiniteData } from '@tanstack/react-query';

/** The cached feed of a card: pages of items, newest first, as the infinite query holds them. */
export type FeedData = InfiniteData<CardFeedPageDto, unknown>;

/** Id of a comment that is on its way to the server. */
const PENDING_PREFIX = 'pending:';

export const isPendingComment = (id: string): boolean => id.startsWith(PENDING_PREFIX);

let pendingCounter = 0;

export function newPendingId(): string {
  pendingCounter += 1;
  return `${PENDING_PREFIX}${pendingCounter}`;
}

/** Newest first: by time, ties by id, like the server. */
function isNewer(a: FeedItemDto, b: FeedItemDto): boolean {
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt;
  return a.id > b.id;
}

export function hasItem(data: FeedData, id: string): boolean {
  return data.pages.some((page) => page.items.some((item) => item.id === id));
}

/** The comment with this id, if the feed holds it. */
export function findComment(data: FeedData, id: string): CommentDto | undefined {
  for (const page of data.pages) {
    for (const item of page.items) {
      if (item.id === id && item.kind === 'comment') return item;
    }
  }
  return undefined;
}

function mapPages(data: FeedData, change: (items: FeedItemDto[]) => FeedItemDto[]): FeedData {
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: change(page.items) })) };
}

/**
 * Adds the item where its time puts it; one that is already there changes nothing.
 * An item older than everything loaded while more pages follow is left out: it comes with them.
 */
export function insertItem(data: FeedData, item: FeedItemDto): FeedData {
  if (hasItem(data, item.id)) return data;
  const pageIndex = data.pages.findIndex((page) => page.items.some((other) => isNewer(item, other)));
  if (pageIndex === -1) {
    const last = data.pages.at(-1);
    if (!last || last.nextCursor !== null) return data;
    return mapPageAt(data, data.pages.length - 1, [...last.items, item]);
  }
  const items = data.pages[pageIndex]?.items ?? [];
  const at = items.findIndex((other) => isNewer(item, other));
  return mapPageAt(data, pageIndex, [...items.slice(0, at), item, ...items.slice(at)]);
}

function mapPageAt(data: FeedData, index: number, items: FeedItemDto[]): FeedData {
  return {
    ...data,
    pages: data.pages.map((page, i) => (i === index ? { ...page, items } : page)),
  };
}

/** The item with this id replaced; nothing changes when it is not loaded. */
export function replaceItem(data: FeedData, id: string, item: FeedItemDto): FeedData {
  if (!hasItem(data, id)) return data;
  return mapPages(data, (items) => items.map((other) => (other.id === id ? item : other)));
}

export function removeItem(data: FeedData, id: string): FeedData {
  if (!hasItem(data, id)) return data;
  return mapPages(data, (items) => items.filter((other) => other.id !== id));
}

/**
 * Puts the server's comment where the pending one was. When the comment already arrived
 * another way (a refetch), the pending one is just dropped.
 */
export function settlePending(data: FeedData, pendingId: string, item: FeedItemDto): FeedData {
  return hasItem(data, item.id) ? removeItem(data, pendingId) : replaceItem(data, pendingId, item);
}

/** All loaded items in order, each id once (pages fetched at different times may overlap). */
export function flattenFeed(data: FeedData | undefined): FeedItemDto[] {
  if (!data) return [];
  const seen = new Set<string>();
  return data.pages
    .flatMap((page) => page.items)
    .filter((item) => !seen.has(item.id) && seen.add(item.id));
}
