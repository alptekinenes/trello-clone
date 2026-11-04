import type { CardSummaryDto } from '@trello/contracts';
import { useMoveCard } from '../api/use-card-mutations';
import { useBoard } from '../api/use-board';
import { buildColumns } from '../lib/card-columns';

interface MoveToListEndOptions {
  /** Gets the card as placed in the target list by the optimistic move. */
  onMoved?: (card: CardSummaryDto) => void;
  /** Where failure texts go; default: an error toast. */
  notifyError?: (message: string) => void;
}

/**
 * Moves a card to the end of another list (the list picker of the card dialog), with the
 * optimistic move, rollback and conflict handling of `useMoveCard`. The same list is a no-op.
 */
export function useMoveCardToListEnd(boardId: string, options: MoveToListEndOptions = {}) {
  const { data: detail } = useBoard(boardId);
  const moveCard = useMoveCard(boardId, options);

  return function moveToListEnd(cardId: string, listId: string) {
    const cards = detail?.cards ?? [];
    const card = cards.find((item) => item.id === cardId);
    if (!detail || !card || card.listId === listId) return;
    const targetIds = buildColumns(detail.lists, cards)[listId] ?? [];
    moveCard.mutate({
      cardId,
      listId,
      afterCardId: targetIds[targetIds.length - 1] ?? null,
      beforeCardId: null,
    });
  };
}
