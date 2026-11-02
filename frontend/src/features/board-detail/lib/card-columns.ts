import type { CardSummaryDto, ListDto } from '@trello/contracts';
import { sortByPosition } from '../../../shared/lib/sort-by-position';
import { type Columns, neighboursOf, sameNeighbours } from '../../../shared/lib/sortable-columns';

/** Where a card sits: its list, index, and the neighbours the server needs to place it. */
export interface CardPlace {
  listId: string;
  index: number;
  afterCardId: string | null;
  beforeCardId: string | null;
}

/** Columns of the given lists; cards of other lists are left out. */
export function buildColumns(lists: readonly ListDto[], cards: CardSummaryDto[]): Columns {
  const columns: Columns = Object.fromEntries(lists.map((list) => [list.id, []]));
  for (const card of sortByPosition(cards)) columns[card.listId]?.push(card.id);
  return columns;
}

export function placeOf(columns: Columns, cardId: string): CardPlace | null {
  const place = neighboursOf(columns, cardId);
  if (place === null) return null;
  return {
    listId: place.containerId,
    index: place.index,
    afterCardId: place.afterId,
    beforeCardId: place.beforeId,
  };
}

/** True when both places have the same list and neighbours, so nothing has to be sent. */
export function samePlace(a: CardPlace, b: CardPlace): boolean {
  const neighbours = (place: CardPlace) => ({
    containerId: place.listId,
    index: place.index,
    afterId: place.afterCardId,
    beforeId: place.beforeCardId,
  });
  return sameNeighbours(neighbours(a), neighbours(b));
}
