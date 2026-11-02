import { zodResolver } from '@hookform/resolvers/zod';
import type { CardSummaryDto, ListDto } from '@trello/contracts';
import { useForm, useWatch } from 'react-hook-form';
import { useArchiveCard, useMoveCard } from '../api/use-card-mutations';
import { buildColumns, moveToColumn, placeOf, samePlace } from '../lib/card-columns';
import { type MoveCardFormValues, moveCardSchema } from '../schemas/card-schemas';
import { useCardUiStore } from '../store/card-ui-store';

/**
 * The card actions dialog: move the card by picking a list and a position
 * (the keyboard and screen reader friendly way to move across lists), or archive it.
 * After a move the card takes focus in its new place.
 */
export function useCardActions(
  boardId: string,
  card: CardSummaryDto,
  lists: ListDto[],
  cards: CardSummaryDto[],
) {
  const closeActions = useCardUiStore((state) => state.closeActions);
  const focusCard = useCardUiStore((state) => state.focusCard);
  const focusAddCard = useCardUiStore((state) => state.focusAddCard);
  // The card keeps the focus: in its new place, or back in its old one if the move fails.
  const moveCard = useMoveCard(boardId, {
    onMoved: focusCard,
    onRollback: (restored) => focusCard(restored ?? card),
  });
  const archiveCard = useArchiveCard(boardId);

  const columns = buildColumns(lists, cards);
  const current = placeOf(columns, card.id);
  const currentPosition = (current?.index ?? 0) + 1;
  /** Places in `listId` the card can take: one more than the other cards there. */
  const placesIn = (listId: string) =>
    (columns[listId] ?? []).filter((id) => id !== card.id).length + 1;

  const form = useForm<MoveCardFormValues>({
    resolver: zodResolver(moveCardSchema),
    defaultValues: { listId: card.listId, position: currentPosition },
  });
  const [listId, position] = useWatch({ control: form.control, name: ['listId', 'position'] });

  function selectList(nextListId: string) {
    form.setValue('listId', nextListId);
    // Staying keeps the current place; another list puts the card at its end.
    form.setValue(
      'position',
      nextListId === card.listId ? currentPosition : placesIn(nextListId),
    );
  }

  const onSubmit = form.handleSubmit((values) => {
    closeActions();
    const next = placeOf(moveToColumn(columns, card.id, values.listId, values.position - 1), card.id);
    if (!next || !current || samePlace(next, current)) {
      focusCard(card);
      return;
    }
    moveCard.mutate({
      cardId: card.id,
      listId: next.listId,
      afterCardId: next.afterCardId,
      beforeCardId: next.beforeCardId,
    });
  });

  /**
   * The focus moves to the card below, or above when it was the last one, or
   * to the list's "Kart ekle" button when it was the only one.
   */
  function archive() {
    const ids = current ? columns[current.listId] : [];
    const neighbourId = current ? (ids[current.index + 1] ?? ids[current.index - 1]) : undefined;
    const neighbour = cards.find((item) => item.id === neighbourId);
    closeActions();
    if (neighbour) focusCard(neighbour);
    else focusAddCard(card.listId);
    archiveCard.mutate(card);
  }

  return {
    lists,
    listId,
    position,
    positions: Array.from({ length: placesIn(listId) }, (_, i) => i + 1),
    isCurrent: (place: number) => listId === card.listId && place === currentPosition,
    selectList,
    selectPosition: (place: number) => form.setValue('position', place),
    onSubmit,
    archive,
    close: closeActions,
  };
}
