import type { CardDetailDto, CardSummaryDto } from '@trello/contracts';
import {
  CHECKLIST_ORDER,
  CHECKLIST_SELECT,
  type ChecklistRow,
  toChecklistDto,
} from '../checklists/checklist.mapper.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Columns and relations a card tile needs (labels and checklist counts included).
 * The description is left out on purpose: it can be 10k characters per card.
 */
export const CARD_SELECT = {
  id: true,
  listId: true,
  title: true,
  position: true,
  dueDate: true,
  dueComplete: true,
  archivedAt: true,
  labels: { select: { labelId: true }, orderBy: { assignedAt: 'asc' } },
  checklists: { select: { items: { select: { isCompleted: true } } } },
} as const;

/** Everything the card dialog needs: the description and full checklists on top of the summary. */
export const CARD_DETAIL_SELECT = {
  ...CARD_SELECT,
  boardId: true,
  description: true,
  checklists: { select: CHECKLIST_SELECT, orderBy: [...CHECKLIST_ORDER] },
} satisfies Prisma.CardSelect;

/** List order; id breaks ties so every reader sees the same order. */
export const CARD_ORDER = [{ position: 'asc' }, { id: 'asc' }] as const;

export interface CardRow {
  id: string;
  listId: string;
  title: string;
  position: number;
  dueDate: Date | null;
  dueComplete: boolean;
  archivedAt: Date | null;
  labels: { labelId: string }[];
  checklists: { items: { isCompleted: boolean }[] }[];
}

export function toCardSummary(card: CardRow, hasDescription: boolean): CardSummaryDto {
  const items = card.checklists.flatMap((checklist) => checklist.items);
  return {
    id: card.id,
    listId: card.listId,
    title: card.title,
    position: card.position,
    dueDate: card.dueDate?.toISOString() ?? null,
    dueComplete: card.dueComplete,
    archivedAt: card.archivedAt?.toISOString() ?? null,
    labelIds: card.labels.map((label) => label.labelId),
    hasDescription,
    checklistTotal: items.length,
    checklistDone: items.filter((item) => item.isCompleted).length,
  };
}

export interface CardDetailRow extends Omit<CardRow, 'checklists'> {
  boardId: string;
  description: string | null;
  checklists: ChecklistRow[];
}

export function toCardDetail(card: CardDetailRow): CardDetailDto {
  return {
    ...toCardSummary(card, card.description !== null),
    boardId: card.boardId,
    description: card.description,
    checklists: card.checklists.map(toChecklistDto),
  };
}
