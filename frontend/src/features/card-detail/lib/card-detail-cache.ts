import type {
  CardDetailDto,
  CardSummaryDto,
  ChecklistDto,
  ChecklistItemDto,
  UpdateCardRequest,
} from '@trello/contracts';
import { sortByPosition } from '../../../shared/lib/sort-by-position';

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

/** The card with its checklist counters recomputed from the checklists. */
export function withCounters(card: CardDetailDto): CardDetailDto {
  const items = card.checklists.flatMap((checklist) => checklist.items);
  return {
    ...card,
    checklistTotal: items.length,
    checklistDone: items.filter((item) => item.isCompleted).length,
  };
}

function withChecklists(card: CardDetailDto, checklists: ChecklistDto[]): CardDetailDto {
  return withCounters({ ...card, checklists: sortByPosition(checklists) });
}

/** Adds the checklist, or replaces the one with the same id. */
export function upsertChecklist(card: CardDetailDto, checklist: ChecklistDto): CardDetailDto {
  const others = card.checklists.filter((item) => item.id !== checklist.id);
  return withChecklists(card, [...others, { ...checklist, items: sortByPosition(checklist.items) }]);
}

export function patchChecklist(
  card: CardDetailDto,
  checklistId: string,
  changes: Partial<Pick<ChecklistDto, 'title' | 'position'>>,
): CardDetailDto {
  return withChecklists(
    card,
    card.checklists.map((item) => (item.id === checklistId ? { ...item, ...changes } : item)),
  );
}

export function removeChecklist(card: CardDetailDto, checklistId: string): CardDetailDto {
  return withChecklists(
    card,
    card.checklists.filter((item) => item.id !== checklistId),
  );
}

function mapChecklist(
  card: CardDetailDto,
  checklistId: string,
  change: (items: ChecklistItemDto[]) => ChecklistItemDto[],
): CardDetailDto {
  return withChecklists(
    card,
    card.checklists.map((item) =>
      item.id === checklistId ? { ...item, items: sortByPosition(change(item.items)) } : item,
    ),
  );
}

/** Adds the item to its checklist, or replaces the one with the same id. */
export function upsertItem(card: CardDetailDto, item: ChecklistItemDto): CardDetailDto {
  return mapChecklist(card, item.checklistId, (items) => [
    ...items.filter((other) => other.id !== item.id),
    item,
  ]);
}

export function patchItem(
  card: CardDetailDto,
  itemId: string,
  changes: Partial<Pick<ChecklistItemDto, 'content' | 'isCompleted'>>,
): CardDetailDto {
  return withChecklists(
    card,
    card.checklists.map((checklist) => ({
      ...checklist,
      items: checklist.items.map((item) => (item.id === itemId ? { ...item, ...changes } : item)),
    })),
  );
}

/** Takes the item out of its checklist and puts it into `checklistId` at `position`. */
export function moveItem(
  card: CardDetailDto,
  itemId: string,
  checklistId: string,
  position: number,
): CardDetailDto {
  const item = card.checklists.flatMap((checklist) => checklist.items).find((i) => i.id === itemId);
  if (!item) return card;
  const without = removeItem(card, itemId);
  return upsertItem(without, { ...item, checklistId, position });
}

export function removeItem(card: CardDetailDto, itemId: string): CardDetailDto {
  return withChecklists(
    card,
    card.checklists.map((checklist) => ({
      ...checklist,
      items: checklist.items.filter((item) => item.id !== itemId),
    })),
  );
}
