export const CHECKLIST_LIMITS = { TITLE_MAX: 200, ITEM_CONTENT_MAX: 500 } as const;

export interface ChecklistItemDto {
  id: string;
  checklistId: string;
  content: string;
  isCompleted: boolean;
  position: number;
}

export interface ChecklistDto {
  id: string;
  cardId: string;
  title: string;
  position: number;
  /** Ordered by (position, id). */
  items: ChecklistItemDto[];
}

/** New checklists go to the end of the card. */
export interface CreateChecklistRequest {
  title: string;
}

export interface UpdateChecklistRequest {
  title: string;
}

/** Neighbours on the card; same rules as CardAnchors. */
export interface ChecklistAnchors {
  afterChecklistId?: string | null;
  beforeChecklistId?: string | null;
}

export type MoveChecklistRequest = ChecklistAnchors;

export interface MoveChecklistResponse {
  id: string;
  position: number;
}

/** New items go to the end of the checklist. */
export interface CreateChecklistItemRequest {
  content: string;
}

export interface UpdateChecklistItemRequest {
  content?: string;
  isCompleted?: boolean;
}

/** Neighbours in the target checklist; same rules as CardAnchors. */
export interface ChecklistItemAnchors {
  afterItemId?: string | null;
  beforeItemId?: string | null;
}

export interface MoveChecklistItemRequest extends ChecklistItemAnchors {
  /** Target checklist on the same card; may be the item's current one. */
  checklistId: string;
}

export interface MoveChecklistItemResponse {
  id: string;
  checklistId: string;
  position: number;
}
