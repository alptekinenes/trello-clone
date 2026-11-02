import type { CardSummaryDto } from '@trello/contracts';

/** Columns and relations a card tile needs (labels and checklist counts included). */
export const CARD_SELECT = {
  id: true,
  listId: true,
  title: true,
  position: true,
  dueDate: true,
  dueComplete: true,
  archivedAt: true,
  description: true,
  labels: { select: { labelId: true }, orderBy: { assignedAt: 'asc' } },
  checklists: { select: { items: { select: { isCompleted: true } } } },
} as const;

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
  description: string | null;
  labels: { labelId: string }[];
  checklists: { items: { isCompleted: boolean }[] }[];
}

export function toCardSummary(card: CardRow): CardSummaryDto {
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
    hasDescription: Boolean(card.description),
    checklistTotal: items.length,
    checklistDone: items.filter((item) => item.isCompleted).length,
  };
}
