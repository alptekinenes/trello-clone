import type { CardSummaryDto, ListDto } from '@trello/contracts';
import { sortByPosition } from './board-cache';

/** Card ids of each list (by list id), in list order. */
export type Columns = Record<string, string[]>;

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

export function findColumn(columns: Columns, cardId: string): string | null {
  for (const [listId, ids] of Object.entries(columns)) {
    if (ids.includes(cardId)) return listId;
  }
  return null;
}

/** Columns with the card taken out of its list and put into `listId` at `index` (clamped). */
export function moveToColumn(
  columns: Columns,
  cardId: string,
  listId: string,
  index: number,
): Columns {
  if (!(listId in columns)) return columns;
  const next: Columns = {};
  for (const [id, ids] of Object.entries(columns)) next[id] = ids.filter((item) => item !== cardId);
  const target = next[listId];
  target.splice(Math.max(0, Math.min(index, target.length)), 0, cardId);
  return next;
}

export function placeOf(columns: Columns, cardId: string): CardPlace | null {
  const listId = findColumn(columns, cardId);
  if (listId === null) return null;
  const ids = columns[listId];
  const index = ids.indexOf(cardId);
  return {
    listId,
    index,
    afterCardId: ids[index - 1] ?? null,
    beforeCardId: ids[index + 1] ?? null,
  };
}

/**
 * Columns after the card is dropped on `overCardId`. A drop on another card of
 * the same list takes that card's index (dnd-kit's arrayMove rule); anything
 * else leaves the card where dragging put it.
 */
export function dropColumns(columns: Columns, cardId: string, overCardId: string | null): Columns {
  const listId = findColumn(columns, cardId);
  if (listId === null || overCardId === null || overCardId === cardId) return columns;
  const overIndex = columns[listId].indexOf(overCardId);
  return overIndex === -1 ? columns : moveToColumn(columns, cardId, listId, overIndex);
}

/** True when both places have the same list and neighbours, so nothing has to be sent. */
export function samePlace(a: CardPlace, b: CardPlace): boolean {
  return (
    a.listId === b.listId && a.afterCardId === b.afterCardId && a.beforeCardId === b.beforeCardId
  );
}
