import type { CardFeedPageDto, CommentDto } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { testActivity, testComment } from '../../../test/fixtures';
import {
  flattenFeed,
  insertItem,
  isPendingComment,
  newPendingId,
  removeItem,
  replaceItem,
  settlePending,
  type FeedData,
} from './feed-cache';

const at = (minute: number) => `2026-11-05T10:${String(minute).padStart(2, '0')}:00.000Z`;
const comment = (id: string, minute: number, body = id): CommentDto =>
  testComment({ id, body, createdAt: at(minute) });

function feed(...pages: CardFeedPageDto[]): FeedData {
  return { pages, pageParams: pages.map((_, i) => (i === 0 ? null : `cursor-${i}`)) };
}

const ids = (data: FeedData) => data.pages.map((page) => page.items.map((item) => item.id));

describe('insertItem', () => {
  it('puts a new item where its time says, across pages', () => {
    const data = feed(
      { items: [comment('c5', 5), comment('c3', 3)], nextCursor: 'x' },
      { items: [comment('c1', 1)], nextCursor: null },
    );

    expect(ids(insertItem(data, comment('c6', 6)))).toEqual([['c6', 'c5', 'c3'], ['c1']]);
    expect(ids(insertItem(data, comment('c4', 4)))).toEqual([['c5', 'c4', 'c3'], ['c1']]);
    expect(ids(insertItem(data, comment('c2', 2)))).toEqual([['c5', 'c3'], ['c2', 'c1']]);
  });

  it('breaks a tie in time by id, like the server', () => {
    const data = feed({ items: [comment('b', 5)], nextCursor: null });

    expect(ids(insertItem(data, comment('c', 5)))).toEqual([['c', 'b']]);
    expect(ids(insertItem(data, comment('a', 5)))).toEqual([['b', 'a']]);
  });

  it('appends an item older than everything when the last page is the end', () => {
    const data = feed({ items: [comment('c5', 5)], nextCursor: null });
    expect(ids(insertItem(data, comment('c1', 1)))).toEqual([['c5', 'c1']]);
  });

  it('leaves out an item older than everything loaded while more pages follow', () => {
    const data = feed({ items: [comment('c5', 5)], nextCursor: 'more' });
    expect(insertItem(data, comment('c1', 1))).toBe(data);
  });

  it('does not add an item twice', () => {
    const data = feed({ items: [comment('c5', 5)], nextCursor: null });
    expect(insertItem(data, comment('c5', 5))).toBe(data);
  });

  it('fills an empty feed', () => {
    const data = feed({ items: [], nextCursor: null });
    expect(ids(insertItem(data, comment('c1', 1)))).toEqual([['c1']]);
  });
});

describe('replaceItem and removeItem', () => {
  const data = feed({ items: [comment('c2', 2, 'eski'), comment('c1', 1)], nextCursor: null });

  it('replaces the item with that id', () => {
    const next = replaceItem(data, 'c2', comment('c2', 2, 'yeni'));
    expect(next.pages[0]?.items[0]).toMatchObject({ body: 'yeni' });
  });

  it('changes nothing for an item that is not loaded', () => {
    expect(replaceItem(data, 'zzz', comment('zzz', 9))).toBe(data);
    expect(removeItem(data, 'zzz')).toBe(data);
  });

  it('removes the item', () => {
    expect(ids(removeItem(data, 'c2'))).toEqual([['c1']]);
  });
});

describe('settlePending', () => {
  it('swaps the pending comment for the server one', () => {
    const pendingId = newPendingId();
    expect(isPendingComment(pendingId)).toBe(true);
    expect(isPendingComment('c1')).toBe(false);
    const data = feed({ items: [comment(pendingId, 5), comment('c1', 1)], nextCursor: null });

    expect(ids(settlePending(data, pendingId, comment('real', 5)))).toEqual([['real', 'c1']]);
  });

  it('only drops the pending comment when the real one is already there', () => {
    const pendingId = newPendingId();
    const data = feed({ items: [comment(pendingId, 5), comment('real', 5)], nextCursor: null });

    expect(ids(settlePending(data, pendingId, comment('real', 5)))).toEqual([['real']]);
  });
});

describe('flattenFeed', () => {
  it('lists the pages in order, each id once', () => {
    const data = feed(
      { items: [comment('c3', 3), comment('c2', 2)], nextCursor: 'x' },
      { items: [comment('c2', 2), testActivity({ id: 'a1' })], nextCursor: null },
    );

    expect(flattenFeed(data).map((item) => item.id)).toEqual(['c3', 'c2', 'a1']);
    expect(flattenFeed(undefined)).toEqual([]);
  });
});
