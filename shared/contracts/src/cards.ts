export const CARD_LIMITS = {
  TITLE_MAX: 512,
} as const;

/** What a card tile needs; the board page gets one per active card. */
export interface CardSummaryDto {
  id: string;
  listId: string;
  title: string;
  position: number;
  dueDate: string | null;
  dueComplete: boolean;
  archivedAt: string | null;
  labelIds: string[];
  hasDescription: boolean;
  checklistTotal: number;
  checklistDone: number;
}

/** Neighbours in the target list; same rules as ListAnchors. */
export interface CardAnchors {
  afterCardId?: string | null;
  beforeCardId?: string | null;
}

export interface CreateCardRequest extends CardAnchors {
  title: string;
}

export interface UpdateCardRequest {
  title?: string;
  /** true archives the card; false restores it to the end of its list. */
  archived?: boolean;
}

export interface MoveCardRequest extends CardAnchors {
  /** Target list on the same board; may be the card's current list. */
  listId: string;
}

export interface MoveCardResponse {
  id: string;
  listId: string;
  position: number;
}
