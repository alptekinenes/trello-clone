import type { CardDetailDto, CardSummaryDto, UpdateCardRequest } from '@trello/contracts';

/** The fields of the board's card tile that the card dialog can change. */
export type CardSummaryContent = Pick<
  CardSummaryDto,
  | 'title'
  | 'dueDate'
  | 'dueComplete'
  | 'labelIds'
  | 'hasDescription'
  | 'checklistTotal'
  | 'checklistDone'
>;

/**
 * Content fields of a card for its tile. Never list or position: the card may have
 * been moved on the board meanwhile.
 */
export function summaryOf(card: CardDetailDto): CardSummaryContent {
  return {
    title: card.title,
    dueDate: card.dueDate,
    dueComplete: card.dueComplete,
    labelIds: card.labelIds,
    hasDescription: card.description !== null,
    checklistTotal: card.checklistTotal,
    checklistDone: card.checklistDone,
  };
}

/** The card after an edit, as the server will store it (blank description is null, no date means not complete). */
export function applyCardUpdate(card: CardDetailDto, changes: UpdateCardRequest): CardDetailDto {
  const next = { ...card };
  if (changes.title !== undefined) next.title = changes.title;
  if (changes.description !== undefined) {
    next.description = changes.description === null ? null : changes.description.trim() || null;
  }
  if (changes.dueDate !== undefined) {
    next.dueDate = changes.dueDate;
    if (changes.dueDate === null) next.dueComplete = false;
  }
  if (changes.dueComplete !== undefined && next.dueDate !== null) {
    next.dueComplete = changes.dueComplete;
  }
  return next;
}

/** The card with the label added to (or taken off) its labels. */
export function setLabelAssigned(
  card: CardDetailDto,
  labelId: string,
  assigned: boolean,
): CardDetailDto {
  const others = card.labelIds.filter((id) => id !== labelId);
  return { ...card, labelIds: assigned ? [...others, labelId] : others };
}
