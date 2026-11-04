import type { PositionRebalancedData } from './position.js';

export const LIST_LIMITS = {
  TITLE_MAX: 100,
} as const;

export interface ListDto {
  id: string;
  boardId: string;
  title: string;
  position: number;
  archivedAt: string | null;
}

/**
 * Neighbours of the place an item goes to. The server computes the position,
 * so clients never send raw numbers. Neither set = end of the container.
 * When both are set but no longer adjacent, `after` wins.
 */
export interface ListAnchors {
  afterListId?: string | null;
  beforeListId?: string | null;
}

export interface CreateListRequest extends ListAnchors {
  title: string;
}

export interface UpdateListRequest {
  title?: string;
  /** true archives the list; false restores it to the end of the board. */
  archived?: boolean;
}

export type MoveListRequest = ListAnchors;

export interface MoveListResponse {
  id: string;
  position: number;
  /** Set when the move respread the board's other lists; same data as the `position:rebalanced` event. */
  rebalanced: PositionRebalancedData | null;
}
