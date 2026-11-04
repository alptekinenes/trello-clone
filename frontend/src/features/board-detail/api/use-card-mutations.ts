import { useQuery } from '@tanstack/react-query';
import { type CardSummaryDto, ErrorCode, positionBetween } from '@trello/contracts';
import { ApiError } from '../../../shared/lib/http';
import { showToast } from '../../../shared/store/toast-store';
import { boardKeys } from '../../boards';
import { patchCard, removeCard, upsertCard, withRebalance } from '../lib/board-cache';
import { cardsApi } from './cards-api';
import { useBoardMutation } from './use-board-mutation';

export const archivedCardsKey = (boardId: string) =>
  [...boardKeys.detail(boardId), 'archived-cards'] as const;

/** The board changed under the user: a stale anchor or a list that is gone. */
function isStaleBoard(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === ErrorCode.POSITION_CONFLICT || error.code === ErrorCode.INVALID_TARGET)
  );
}

export function useArchivedCards(boardId: string) {
  return useQuery({
    queryKey: archivedCardsKey(boardId),
    queryFn: () => cardsApi.archived(boardId),
  });
}

export interface CreateCardVariables {
  listId: string;
  title: string;
}

export function useCreateCard(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: ({ listId, title }: CreateCardVariables) => cardsApi.create(listId, { title }),
    onSuccessCache: (detail, card: CardSummaryDto) => upsertCard(detail, card),
  });
}

export interface MoveCardVariables {
  cardId: string;
  listId: string;
  afterCardId: string | null;
  beforeCardId: string | null;
}

interface MoveCardOptions {
  /** Gets the card as placed in the cache by the optimistic move. */
  onMoved?: (card: CardSummaryDto) => void;
  /** The move failed; gets the card as it is back in its old place. */
  onRollback?: (card: CardSummaryDto | undefined) => void;
}

/**
 * Optimistic: the card jumps to its new place at once. A stale board (409, or
 * a target list that is gone) reloads the board.
 */
export function useMoveCard(boardId: string, { onMoved, onRollback }: MoveCardOptions = {}) {
  return useBoardMutation({
    boardId,
    mutationFn: ({ cardId, ...body }: MoveCardVariables) => cardsApi.move(cardId, body),
    optimistic: (detail, { cardId, listId, afterCardId, beforeCardId }) => {
      const positionOf = (id: string | null) =>
        detail.cards.find((card) => card.id === id)?.position ?? null;
      const position = positionBetween(positionOf(afterCardId), positionOf(beforeCardId));
      return patchCard(detail, cardId, { listId, position });
    },
    onOptimistic: ({ cardId }, detail) => {
      const card = detail?.cards.find((item) => item.id === cardId);
      if (card) onMoved?.(card);
    },
    onRollback: ({ cardId }, detail) => onRollback?.(detail?.cards.find((item) => item.id === cardId)),
    // The respread siblings first, then the card itself at the position the server gave it.
    onSuccessCache: (detail, { id, listId, position, rebalanced }) =>
      patchCard(withRebalance(detail, rebalanced), id, { listId, position }),
    onError: (error) =>
      showToast(
        isStaleBoard(error)
          ? 'Kartlar bu sırada başka biri tarafından değiştirildi. Pano yenilendi.'
          : 'Kart taşınamadı. Tekrar dene.',
        { tone: 'error' },
      ),
  });
}

/** Optimistic: the card disappears at once; the toast offers to undo. */
export function useArchiveCard(boardId: string) {
  // The toast has no other place to show a failed undo.
  const restore = useRestoreCard(boardId, {
    onError: () => showToast('Kart geri yüklenemedi. Tekrar dene.', { tone: 'error' }),
  });
  return useBoardMutation({
    boardId,
    mutationFn: (card: CardSummaryDto) => cardsApi.update(card.id, { archived: true }),
    optimistic: (detail, card) => removeCard(detail, card.id),
    onSuccess: (_data, card) =>
      showToast(`“${card.title}” kartı arşivlendi.`, {
        action: { label: 'Geri al', onClick: () => restore.mutate(card.id) },
      }),
    onError: () => showToast('Kart arşivlenemedi. Tekrar dene.', { tone: 'error' }),
  });
}

/** Back to its list, at the end. The list must not be archived (400 INVALID_TARGET). */
export function useRestoreCard(
  boardId: string,
  { onSuccess, onError }: { onSuccess?: () => void; onError?: () => void } = {},
) {
  return useBoardMutation({
    boardId,
    mutationFn: (cardId: string) => cardsApi.update(cardId, { archived: false }),
    onSuccessCache: (detail, card: CardSummaryDto) => upsertCard(detail, card),
    onSuccess,
    onError,
  });
}

/** Permanent. Not optimistic: the archive dialog waits for the answer. */
export function useDeleteCard(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: (cardId: string) => cardsApi.remove(cardId),
  });
}
