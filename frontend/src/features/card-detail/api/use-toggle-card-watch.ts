import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardDetailDto } from '@trello/contracts';
import { boardKeys } from '../../boards';
import { boardMutationKey, setCardWatched } from '../../board-detail';
import { useCardDetailStore } from '../store/card-detail-store';
import { cardDetailApi } from './card-detail-api';

export interface ToggleWatchVariables {
  cardId: string;
  watching: boolean;
}

/**
 * Starts or stops watching a card. The watched ids live in the board cache (per user), so the
 * change is made there at once; a failure takes back only that card's id. It shares the board's
 * mutation key: only the last running mutation refetches the board.
 */
export function useToggleCardWatch(boardId: string) {
  const queryClient = useQueryClient();
  const boardKey = boardKeys.detail(boardId);
  const mutationKey = boardMutationKey(boardId);
  const setWatched = (cardId: string, watching: boolean) =>
    queryClient.setQueryData<BoardDetailDto>(
      boardKey,
      (detail) => detail && setCardWatched(detail, cardId, watching),
    );

  return useMutation({
    mutationKey,
    mutationFn: ({ cardId, watching }: ToggleWatchVariables) =>
      watching ? cardDetailApi.watch(cardId) : cardDetailApi.unwatch(cardId),
    onMutate: async ({ cardId, watching }) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      setWatched(cardId, watching);
    },
    onError: (_error, { cardId, watching }) => {
      setWatched(cardId, !watching);
      useCardDetailStore.getState().showError(cardId, 'İzleme değişikliği kaydedilemedi. Tekrar dene.');
    },
    // This mutation still counts as running here, so 1 means "the last one".
    onSettled: () =>
      queryClient.isMutating({ mutationKey }) === 1
        ? queryClient.invalidateQueries({ queryKey: boardKey })
        : undefined,
  });
}
