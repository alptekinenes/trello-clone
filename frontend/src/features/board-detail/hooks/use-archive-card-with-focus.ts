import type { CardSummaryDto } from '@trello/contracts';
import { useArchiveCard } from '../api/use-card-mutations';
import { useBoard } from '../api/use-board';
import { buildColumns, placeOf } from '../lib/card-columns';
import { useCardUiStore } from '../store/card-ui-store';

/**
 * Archives a card and hands the focus on: to the card below, or above when it was
 * the last one, or to the list's "Kart ekle" button when it was the only one.
 */
export function useArchiveCardWithFocus(boardId: string) {
  const { data: detail } = useBoard(boardId);
  const focusCard = useCardUiStore((state) => state.focusCard);
  const focusAddCard = useCardUiStore((state) => state.focusAddCard);
  const archiveCard = useArchiveCard(boardId);

  return function archive(card: CardSummaryDto) {
    const cards = detail?.cards ?? [];
    const columns = buildColumns(detail?.lists ?? [], cards);
    const place = placeOf(columns, card.id);
    const ids = place ? columns[place.listId] : [];
    const neighbourId = place ? (ids[place.index + 1] ?? ids[place.index - 1]) : undefined;
    const neighbour = cards.find((item) => item.id === neighbourId);
    if (neighbour) focusCard(neighbour);
    else focusAddCard(card.listId);
    archiveCard.mutate(card);
  };
}
