import type { CommentDto, FeedItemDto } from '@trello/contracts';
import { compareFeedItems, mergeFeed } from './merge-feed.js';

const AUTHOR = { id: 'u1', name: 'Ayşe', avatarUrl: null };

function comment(id: string, createdAt: string): CommentDto {
  return { kind: 'comment', id, cardId: 'c1', author: AUTHOR, body: id, createdAt, editedAt: null };
}

function activity(id: string, createdAt: string): FeedItemDto {
  return {
    kind: 'activity',
    id,
    cardId: 'c1',
    actor: AUTHOR,
    createdAt,
    type: 'CARD_ARCHIVED',
    data: { cardTitle: 'Kart' },
  };
}

const ids = (items: FeedItemDto[]) => items.map((item) => item.id);

describe('compareFeedItems', () => {
  it('puts the newer item first', () => {
    const older = comment('a', '2026-11-05T10:00:00.000Z');
    const newer = comment('b', '2026-11-05T10:00:01.000Z');
    expect([older, newer].sort(compareFeedItems)).toEqual([newer, older]);
  });

  it('breaks a tie by id, larger first', () => {
    const at = '2026-11-05T10:00:00.000Z';
    expect(ids([comment('a', at), comment('c', at), comment('b', at)].sort(compareFeedItems))).toEqual(
      ['c', 'b', 'a'],
    );
  });
});

describe('mergeFeed', () => {
  it('interleaves comments and activity newest first', () => {
    const merged = mergeFeed(
      [
        [comment('c2', '2026-11-05T10:03:00.000Z'), comment('c1', '2026-11-05T10:01:00.000Z')],
        [activity('a2', '2026-11-05T10:02:00.000Z'), activity('a1', '2026-11-05T10:00:00.000Z')],
      ],
      10,
    );

    expect(ids(merged.items)).toEqual(['c2', 'a2', 'c1', 'a1']);
    expect(merged.hasMore).toBe(false);
  });

  it('keeps the order of rows with an equal timestamp across both sources', () => {
    const at = '2026-11-05T10:00:00.000Z';
    const merged = mergeFeed([[comment('b', at)], [activity('c', at), activity('a', at)]], 10);

    expect(ids(merged.items)).toEqual(['c', 'b', 'a']);
  });

  it('cuts to the limit and says there is more when one extra row was read', () => {
    const merged = mergeFeed(
      [
        [comment('c3', '2026-11-05T10:05:00.000Z'), comment('c2', '2026-11-05T10:03:00.000Z')],
        [activity('a1', '2026-11-05T10:04:00.000Z')],
      ],
      2,
    );

    expect(ids(merged.items)).toEqual(['c3', 'a1']);
    expect(merged.hasMore).toBe(true);
  });

  it('has no more when the rows exactly fill the limit', () => {
    const merged = mergeFeed([[comment('c2', '2026-11-05T10:05:00.000Z'), comment('c1', '2026-11-05T10:03:00.000Z')]], 2);

    expect(merged.items).toHaveLength(2);
    expect(merged.hasMore).toBe(false);
  });

  it('handles empty sources', () => {
    expect(mergeFeed([[], []], 5)).toEqual({ items: [], hasMore: false });
  });
});
