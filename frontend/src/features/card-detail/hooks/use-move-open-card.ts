import type { BoardDetailDto } from '@trello/contracts';
import { useMoveCardToListEnd } from '../../board-detail';
import { useCardDetailStore } from '../store/card-detail-store';

/**
 * Moves the open card to the end of another list. A failure (or a conflict) is shown in the
 * dialog, as a toast would sit behind the modal; the live region says where the card went.
 */
export function useMoveOpenCard(board: BoardDetailDto, cardId: string) {
  return useMoveCardToListEnd(board.board.id, {
    notifyError: (message) => useCardDetailStore.getState().showError(cardId, message),
    onMoved: (card) => {
      const title = board.lists.find((list) => list.id === card.listId)?.title ?? '';
      useCardDetailStore.getState().announce(`Kart “${title}” listesine taşındı.`);
    },
  });
}
