import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardDetailDto, CardDetailDto } from '@trello/contracts';
import { boardKeys } from '../../boards';
import { boardMutationKey, patchCard } from '../../board-detail';
import { summaryOf } from '../lib/card-detail-cache';
import { useCardDetailStore } from '../store/card-detail-store';
import { cardKeys } from './card-keys';

interface CardMutationOptions<TVariables, TData> {
  boardId: string;
  cardId: string;
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Applied to the cached card before the request; rolled back if it fails. */
  optimistic?: (card: CardDetailDto, variables: TVariables) => CardDetailDto;
  /** Applied with the server's answer. Write only what this request changed. */
  onSuccessCard?: (card: CardDetailDto, data: TData, variables: TVariables) => CardDetailDto;
  /** Runs right after a failed request's optimistic change was rolled back. */
  onRollback?: (variables: TVariables) => void;
  /** Shown inside the dialog when the request fails. */
  errorMessage: string | ((error: Error, variables: TVariables) => string);
}

/**
 * Mutation on the card detail cache with the optimistic pattern. Every change of the
 * card is copied to its tile on the board (content fields only), and a failure restores
 * the card alone, so other changes made to the board meanwhile survive.
 * It shares the board's mutation key: only the last running mutation refetches.
 */
export function useCardMutation<TVariables, TData>({
  boardId,
  cardId,
  mutationFn,
  optimistic,
  onSuccessCard,
  onRollback,
  errorMessage,
}: CardMutationOptions<TVariables, TData>) {
  const queryClient = useQueryClient();
  const showError = useCardDetailStore((state) => state.showError);
  const cardKey = cardKeys.detail(cardId);
  const boardKey = boardKeys.detail(boardId);
  const mutationKey = boardMutationKey(boardId);

  function syncSummary() {
    const card = queryClient.getQueryData<CardDetailDto>(cardKey);
    if (!card) return;
    queryClient.setQueryData<BoardDetailDto>(
      boardKey,
      (detail) => detail && patchCard(detail, cardId, summaryOf(card)),
    );
  }

  function updateCard(fn: (card: CardDetailDto) => CardDetailDto) {
    queryClient.setQueryData<CardDetailDto>(cardKey, (card) => card && fn(card));
    syncSummary();
  }

  return useMutation({
    mutationKey,
    mutationFn,
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: cardKey }),
        queryClient.cancelQueries({ queryKey: boardKey }),
      ]);
      const previous = queryClient.getQueryData<CardDetailDto>(cardKey);
      if (optimistic) updateCard((card) => optimistic(card, variables));
      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(cardKey, context.previous);
        syncSummary();
      }
      onRollback?.(variables);
      showError(typeof errorMessage === 'function' ? errorMessage(error, variables) : errorMessage);
    },
    onSuccess: (data, variables) => {
      if (onSuccessCard) updateCard((card) => onSuccessCard(card, data, variables));
    },
    // This mutation still counts as running here, so 1 means "the last one".
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) !== 1) return undefined;
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: boardKey }),
        queryClient.invalidateQueries({ queryKey: cardKey }),
      ]);
    },
  });
}
