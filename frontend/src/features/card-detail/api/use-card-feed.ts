import { useInfiniteQuery } from '@tanstack/react-query';
import { flattenFeed } from '../lib/feed-cache';
import { commentsApi } from './comments-api';
import { cardKeys } from './card-keys';

/** The comments of a card, newest first, with its activity too when `details` is on. */
export function useCardFeed(boardId: string, cardId: string, details: boolean) {
  const query = useInfiniteQuery({
    queryKey: cardKeys.feed(boardId, cardId, details),
    queryFn: ({ pageParam }) => commentsApi.feed(cardId, { details, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
  return { ...query, items: flattenFeed(query.data) };
}
