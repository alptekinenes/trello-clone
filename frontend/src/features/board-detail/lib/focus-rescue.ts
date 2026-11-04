import type { BoardDetailDto } from '@trello/contracts';

/** Attributes the board puts on its list columns and card tiles so the focus can be traced back to them. */
export const LIST_ID_ATTRIBUTE = 'data-list-id';
export const CARD_ID_ATTRIBUTE = 'data-card-id';

/** Where the focus sits on the board: inside a card tile, or inside a list column outside any tile. */
export interface FocusSpot {
  listId: string;
  cardId: string | null;
}

/** What should take the focus when the place it was in is gone. */
export type RescueTarget = { kind: 'add-card'; listId: string } | { kind: 'lists' };

/** The board place that holds `active`, or null when the focus is elsewhere (a dialog, the header...). */
export function focusSpot(active: Element | null): FocusSpot | null {
  const list = active?.closest(`[${LIST_ID_ATTRIBUTE}]`);
  const listId = list?.getAttribute(LIST_ID_ATTRIBUTE);
  if (!listId) return null;
  const cardId = active?.closest(`[${CARD_ID_ATTRIBUTE}]`)?.getAttribute(CARD_ID_ATTRIBUTE) ?? null;
  return { listId, cardId };
}

/**
 * Where the focus goes after a change, or null when its place is still there. A card that was
 * deleted, archived or moved to another list hands it to "Kart ekle" of the list it was in; a
 * list that is gone hands it to the "Listeler" region.
 */
export function rescueTarget(spot: FocusSpot, detail: BoardDetailDto): RescueTarget | null {
  if (!detail.lists.some((list) => list.id === spot.listId)) return { kind: 'lists' };
  if (spot.cardId === null) return null;
  const card = detail.cards.find((item) => item.id === spot.cardId);
  return card?.listId === spot.listId ? null : { kind: 'add-card', listId: spot.listId };
}
