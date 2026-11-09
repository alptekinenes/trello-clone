import type {
  CardDetailDto,
  AttachmentDto,
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
  | 'commentCount'
  | 'attachmentCount'
  | 'coverAttachmentId'
  | 'completedAt'
  | 'coverColor'
  | 'memberIds'
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
    commentCount: card.commentCount,
    attachmentCount: card.attachmentCount,
    coverAttachmentId: card.coverAttachmentId,
    completedAt: card.completedAt,
    coverColor: card.coverColor,
    memberIds: card.memberIds,
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
  if (changes.isCompleted !== undefined) {
    // Completing again keeps the first completion time, like the server.
    next.completedAt = changes.isCompleted ? (card.completedAt ?? new Date().toISOString()) : null;
  }
  // A color and an image cover exclude each other: setting one clears the other.
  if (changes.coverColor !== undefined) {
    next.coverColor = changes.coverColor;
    if (changes.coverColor !== null) next.coverAttachmentId = null;
  }
  if (changes.coverAttachmentId !== undefined) {
    next.coverAttachmentId = changes.coverAttachmentId;
    if (changes.coverAttachmentId !== null) next.coverColor = null;
  }
  return next;
}

/** The card with the user added to (or taken off) its members; assigning twice changes nothing. */
export function setMemberAssigned(
  card: CardDetailDto,
  userId: string,
  assigned: boolean,
): CardDetailDto {
  if (card.memberIds.includes(userId) === assigned) return card;
  return {
    ...card,
    memberIds: assigned ? [...card.memberIds, userId] : card.memberIds.filter((id) => id !== userId),
  };
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

/** Gives the item a new position within its checklist, keeping the checklist's order. */
export function patchItemPosition(card: CardDetailDto, itemId: string, position: number): CardDetailDto {
  return withChecklists(
    card,
    card.checklists.map((checklist) =>
      checklist.items.some((item) => item.id === itemId)
        ? {
            ...checklist,
            items: sortByPosition(
              checklist.items.map((item) => (item.id === itemId ? { ...item, position } : item)),
            ),
          }
        : checklist,
    ),
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

export function findItem(card: CardDetailDto, itemId: string): ChecklistItemDto | undefined {
  return card.checklists.flatMap((checklist) => checklist.items).find((item) => item.id === itemId);
}

export function findChecklist(card: CardDetailDto, checklistId: string): ChecklistDto | undefined {
  return card.checklists.find((checklist) => checklist.id === checklistId);
}

/** Puts the attachment first (newest first) unless it is already there. */
export function insertAttachment(
  card: CardDetailDto,
  attachment: AttachmentDto,
  attachmentCount: number,
): CardDetailDto {
  if (card.attachments.some((existing) => existing.id === attachment.id)) {
    return { ...card, attachmentCount };
  }
  return { ...card, attachments: [attachment, ...card.attachments], attachmentCount };
}

/** Drops the attachment; a cover that pointed at it goes too. */
export function removeAttachment(
  card: CardDetailDto,
  attachmentId: string,
  attachmentCount: number,
): CardDetailDto {
  return {
    ...card,
    attachments: card.attachments.filter((attachment) => attachment.id !== attachmentId),
    attachmentCount,
    coverAttachmentId: card.coverAttachmentId === attachmentId ? null : card.coverAttachmentId,
  };
}

/**
 * Puts back an attachment whose deletion failed: newest first as before, the counter up
 * again, and the cover too when it was the cover (unless another cover was set meanwhile).
 */
export function restoreAttachment(
  card: CardDetailDto,
  attachment: AttachmentDto,
  wasCover: boolean,
): CardDetailDto {
  if (card.attachments.some((existing) => existing.id === attachment.id)) return card;
  const attachments = [...card.attachments, attachment].sort((a, b) =>
    a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
  );
  const restoresCover = wasCover && card.coverAttachmentId === null && card.coverColor === null;
  return {
    ...card,
    attachments,
    attachmentCount: card.attachmentCount + 1,
    coverAttachmentId: restoresCover ? attachment.id : card.coverAttachmentId,
  };
}
