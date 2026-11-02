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
  /** Applied to the cached card before the request. */
  optimistic?: (card: CardDetailDto, variables: TVariables) => CardDetailDto;
  /**
   * Names the parts of the card this change sets (e.g. "title", "item:<id>:isCompleted").
   * A newer change to the same part takes over: this one then neither writes its answer
   * nor rolls back, as the newer one holds the value that counts.
   */
  touches?: (variables: TVariables) => string[];
  /** Puts back what `optimistic` changed, taking it from the card as it was before. */
  revert?: (card: CardDetailDto, previous: CardDetailDto, variables: TVariables) => CardDetailDto;
  /** Applied with the server's answer. Write only what this request changed. */
  onSuccessCard?: (card: CardDetailDto, data: TData, variables: TVariables) => CardDetailDto;
  /** Runs right after the cache was written with the answer, before the board refetches. */
  onSuccess?: (variables: TVariables) => void;
  /** Runs right after a failed request's optimistic change was rolled back. */
  onRollback?: (variables: TVariables) => void;
  /** Shown when the request fails. */
  errorMessage: string | ((error: Error, variables: TVariables) => string);
}

/** Newest change per part of a card, by claim number. */
const latestClaim = new Map<string, number>();
let lastClaim = 0;

type Claims = [key: string, claim: number][];

function claimParts(cardId: string, parts: string[]): Claims {
  return parts.map((part) => {
    lastClaim += 1;
    latestClaim.set(`${cardId}|${part}`, lastClaim);
    return [`${cardId}|${part}`, lastClaim];
  });
}

const holdsAll = (claims: Claims) => claims.every(([key, claim]) => latestClaim.get(key) === claim);

function release(claims: Claims) {
  for (const [key, claim] of claims) {
    if (latestClaim.get(key) === claim) latestClaim.delete(key);
  }
}

/**
 * Mutation on the card detail cache with the optimistic pattern. Every change of the
 * card is copied to its tile on the board (content fields only). A failure puts back
 * only what the change set, so other changes made to the card meanwhile survive.
 * It shares the board's mutation key: only the last running mutation refetches.
 */
export function useCardMutation<TVariables, TData>({
  boardId,
  cardId,
  mutationFn,
  optimistic,
  touches,
  revert,
  onSuccessCard,
  onSuccess,
  onRollback,
  errorMessage,
}: CardMutationOptions<TVariables, TData>) {
  const queryClient = useQueryClient();
  const cardKey = cardKeys.detail(boardId, cardId);
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
      const claims = claimParts(cardId, touches?.(variables) ?? []);
      if (optimistic) updateCard((card) => optimistic(card, variables));
      return { previous, claims };
    },
    onError: (error, variables, context) => {
      const { previous, claims } = context ?? {};
      if (revert && previous && holdsAll(claims ?? [])) {
        updateCard((card) => revert(card, previous, variables));
      }
      onRollback?.(variables);
      useCardDetailStore
        .getState()
        .showError(
          cardId,
          typeof errorMessage === 'function' ? errorMessage(error, variables) : errorMessage,
        );
    },
    onSuccess: (data, variables, context) => {
      if (onSuccessCard && holdsAll(context?.claims ?? [])) {
        updateCard((card) => onSuccessCard(card, data, variables));
      }
      onSuccess?.(variables);
    },
    // This mutation still counts as running here, so 1 means "the last one".
    onSettled: (_data, _error, _variables, context) => {
      release(context?.claims ?? []);
      if (queryClient.isMutating({ mutationKey }) !== 1) return undefined;
      // The card detail sits under the board's key and is refetched with it.
      return queryClient.invalidateQueries({ queryKey: boardKey });
    },
  });
}
