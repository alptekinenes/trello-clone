import { useQueryClient } from '@tanstack/react-query';
import type { CardDetailDto } from '@trello/contracts';
import { useRealtimeEvents } from '../../../shared/hooks/use-realtime-events';
import { asBoardEvent } from '../../../shared/lib/realtime-message';
import { refreshUnlessMutating } from '../../board-detail';
import { cardKeys } from '../api/card-keys';
import { applyCardEvent, type AppliedCardEvent } from '../lib/apply-card-event';
import { applyFeedEvent } from '../lib/apply-feed-event';
import type { FeedData } from '../lib/feed-cache';
import { useCardDetailStore } from '../store/card-detail-store';

/**
 * Keeps the open card live: other users' changes to it (title, labels, checklists,
 * ...) reach the dialog without a reload. Only the open card's cache is followed;
 * other cards are refreshed when they are opened.
 */
export function useCardRealtime(boardId: string, cardId: string): void {
  const queryClient = useQueryClient();
  const markGone = useCardDetailStore((state) => state.markGone);

  useRealtimeEvents((message) => {
    const event = asBoardEvent(message);
    if (!event || message.boardId !== boardId) return;

    const cardKey = cardKeys.detail(boardId, cardId);
    // A request already on its way may have read the card before this change.
    const fetching = queryClient.isFetching({ queryKey: cardKey, exact: true }) > 0;
    const feedsKey = cardKeys.feeds(boardId, cardId);
    const feedFetching = queryClient.isFetching({ queryKey: feedsKey }) > 0;
    const applied: { value: AppliedCardEvent | null } = { value: null };
    queryClient.setQueryData<CardDetailDto>(cardKey, (card) => {
      if (!card) return card;
      applied.value = applyCardEvent(card, event);
      return applied.value.card;
    });

    for (const details of [false, true]) {
      queryClient.setQueryData<FeedData>(
        cardKeys.feed(boardId, cardId, details),
        (feed) => feed && applyFeedEvent(feed, event, cardId, details),
      );
    }

    if (feedFetching) refreshUnlessMutating(queryClient, boardId, feedsKey);
    if (applied.value?.gone) markGone(cardId);
    if (applied.value?.refetch || fetching) {
      refreshUnlessMutating(queryClient, boardId, cardKey, { exact: true });
    }
  });
}
