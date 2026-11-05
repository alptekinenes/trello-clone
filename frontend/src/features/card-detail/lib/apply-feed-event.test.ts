import type { BoardEvent } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { testActivity, testComment } from '../../../test/fixtures';
import { applyFeedEvent } from './apply-feed-event';
import type { FeedData } from './feed-cache';

const OLD = testComment({ id: 'c1', body: 'eski', createdAt: '2026-11-05T10:01:00.000Z' });
const NEW = testComment({ id: 'c2', body: 'yeni', createdAt: '2026-11-05T10:02:00.000Z' });
const ACTIVITY = testActivity({ id: 'a1', createdAt: '2026-11-05T10:03:00.000Z' });

const data: FeedData = { pages: [{ items: [OLD], nextCursor: null }], pageParams: [null] };

const ids = (feed: FeedData) => feed.pages.flatMap((page) => page.items.map((item) => item.id));

function event<T extends BoardEvent['type']>(
  type: T,
  payload: Extract<BoardEvent, { type: T }>['data'],
) {
  return { type, data: payload } as BoardEvent;
}

describe('applyFeedEvent', () => {
  it('adds a created comment, once', () => {
    const created = event('comment:created', { comment: NEW, commentCount: 2 });
    const next = applyFeedEvent(data, created, 'card-1', false);

    expect(ids(next)).toEqual(['c2', 'c1']);
    expect(applyFeedEvent(next, created, 'card-1', false)).toBe(next);
  });

  it('ignores comments of other cards', () => {
    const other = testComment({ id: 'x', body: 'x', cardId: 'card-2' });
    const created = event('comment:created', { comment: other, commentCount: 1 });
    const deleted = event('comment:deleted', { id: 'c1', cardId: 'card-2', commentCount: 0 });

    expect(applyFeedEvent(data, created, 'card-1', false)).toBe(data);
    expect(applyFeedEvent(data, event('comment:updated', other), 'card-1', false)).toBe(data);
    expect(applyFeedEvent(data, deleted, 'card-1', false)).toBe(data);
  });

  it('replaces an edited comment', () => {
    const edited = { ...OLD, body: 'düzenlenmiş', editedAt: '2026-11-05T10:05:00.000Z' };
    const next = applyFeedEvent(data, event('comment:updated', edited), 'card-1', false);
    expect(next.pages[0]?.items[0]).toEqual(edited);
  });

  it('removes a deleted comment', () => {
    const deleted = event('comment:deleted', { id: 'c1', cardId: 'card-1', commentCount: 0 });
    expect(ids(applyFeedEvent(data, deleted, 'card-1', false))).toEqual([]);
  });

  it('adds activity only to the feed that shows details', () => {
    const created = event('activity:created', ACTIVITY);

    expect(applyFeedEvent(data, created, 'card-1', false)).toBe(data);
    expect(ids(applyFeedEvent(data, created, 'card-1', true))).toEqual(['a1', 'c1']);
  });

  it('ignores every other event', () => {
    const other = event('card:deleted', { id: 'card-1', listId: 'list-1' });
    expect(applyFeedEvent(data, other, 'card-1', true)).toBe(data);
  });
});
