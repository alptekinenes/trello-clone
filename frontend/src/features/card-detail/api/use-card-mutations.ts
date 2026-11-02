import { useQueryClient } from '@tanstack/react-query';
import type { CardSummaryDto, UpdateCardRequest } from '@trello/contracts';
import { useRestoreCard } from '../../board-detail';
import { applyCardUpdate } from '../lib/card-detail-cache';
import { useCardDetailStore } from '../store/card-detail-store';
import { cardDetailApi } from './card-detail-api';
import { cardKeys } from './card-keys';
import { useCardMutation } from './use-card-mutation';

/** Title is checked before this: the server rejects an empty one. */
export type CardEdit = Pick<UpdateCardRequest, 'title' | 'description' | 'dueDate' | 'dueComplete'>;

/** Only the fields this request changed come from the answer; the rest stays as edited. */
function applyAnswer(
  card: ReturnType<typeof applyCardUpdate>,
  answer: CardSummaryDto,
  edit: CardEdit,
) {
  return {
    ...card,
    ...(edit.title !== undefined && { title: answer.title }),
    ...(edit.dueDate !== undefined && { dueDate: answer.dueDate, dueComplete: answer.dueComplete }),
    ...(edit.dueComplete !== undefined && { dueComplete: answer.dueComplete }),
  };
}

/** Edits the card's title, description or due date. */
export function useUpdateCard(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: (edit: CardEdit) => cardDetailApi.update(cardId, edit),
    optimistic: applyCardUpdate,
    onSuccessCard: (card, answer: CardSummaryDto, edit) => applyAnswer(card, answer, edit),
    errorMessage: 'Değişiklik kaydedilemedi. Tekrar dene.',
  });
}

/** Restores the open (archived) card to its list and refreshes the dialog. */
export function useRestoreOpenCard(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const showError = useCardDetailStore((state) => state.showError);
  const restore = useRestoreCard(boardId, {
    onError: () => showError('Kart geri yüklenemedi. Listesi arşivde olabilir.'),
  });
  return {
    restore: () =>
      restore.mutate(cardId, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: cardKeys.detail(cardId) }),
      }),
    isRestoring: restore.isPending,
  };
}
