import { useQuery } from '@tanstack/react-query';
import { cardDetailApi } from './card-detail-api';
import { cardKeys } from './card-keys';

/** The open card with its description and checklists. */
export function useCardDetail(boardId: string, cardId: string) {
  return useQuery({
    queryKey: cardKeys.detail(boardId, cardId),
    queryFn: () => cardDetailApi.get(cardId),
    staleTime: 30_000,
    // The board may have moved or archived the card since the last visit.
    refetchOnMount: 'always',
  });
}
