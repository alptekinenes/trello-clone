import type { FeedItemDto } from '@trello/contracts';
import { useEffect, useRef } from 'react';
import { feedItemDomId } from '../lib/focus-ids';

/**
 * "Daha fazla göster": loads the next page and, once it is there, moves focus to its first
 * item so a keyboard or screen reader user continues where the new items begin. The focus
 * move is dropped when the request fails or the item it hangs on has gone.
 */
export function useFeedLoadMore(
  items: FeedItemDto[],
  fetchNextPage: () => Promise<{ isError: boolean }>,
) {
  const focusAfterId = useRef<string | null>(null);

  // Focus is a DOM side effect; it waits until the new page has rendered.
  useEffect(() => {
    const anchorId = focusAfterId.current;
    if (anchorId === null) return;
    const anchorIndex = items.findIndex((item) => item.id === anchorId);
    if (anchorIndex === -1) {
      focusAfterId.current = null;
      return;
    }
    const next = items[anchorIndex + 1];
    if (!next) return;
    focusAfterId.current = null;
    document.getElementById(feedItemDomId(next.id))?.focus();
  }, [items]);

  return function loadMore() {
    focusAfterId.current = items.at(-1)?.id ?? null;
    void fetchNextPage().then((result) => {
      if (result.isError) focusAfterId.current = null;
    });
  };
}
