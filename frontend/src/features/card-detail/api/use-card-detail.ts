import { useQuery } from '@tanstack/react-query';
import { cardDetailApi } from './card-detail-api';
import { cardKeys } from './card-keys';

/** The open card with its description and checklists. */
export function useCardDetail(cardId: string) {
  return useQuery({
    queryKey: cardKeys.detail(cardId),
    queryFn: () => cardDetailApi.get(cardId),
    staleTime: 30_000,
  });
}
