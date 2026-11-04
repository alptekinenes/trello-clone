import type { ChecklistDto } from './checklists.js';
import type { PositionRebalancedData } from './position.js';

export const CARD_LIMITS = {
  TITLE_MAX: 512,
  DESCRIPTION_MAX: 10_000,
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

/** Everything the card dialog needs. Label names and colors come from the board detail. */
export interface CardDetailDto extends CardSummaryDto {
  boardId: string;
  description: string | null;
  /** Ordered by (position, id). */
  checklists: ChecklistDto[];
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
  /** Plain text. null, or only whitespace, clears it. */
  description?: string | null;
  /** ISO 8601 date-time with `Z` or an offset; null clears the due date (and dueComplete). */
  dueDate?: string | null;
  dueComplete?: boolean;
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
  /** Set when the move respread the target list's other cards; same data as the `position:rebalanced` event. */
  rebalanced: PositionRebalancedData | null;
}
