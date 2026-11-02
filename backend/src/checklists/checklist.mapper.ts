import type { ChecklistDto, ChecklistItemDto } from '@trello/contracts';
import type { Prisma } from '../generated/prisma/client.js';

/** Items of a checklist, and checklists of a card: position first, id breaks ties. */
export const ITEM_ORDER = [{ position: 'asc' }, { id: 'asc' }] as const;
export const CHECKLIST_ORDER = [{ position: 'asc' }, { id: 'asc' }] as const;

export const ITEM_SELECT = {
  id: true,
  checklistId: true,
  content: true,
  isCompleted: true,
  position: true,
} as const;

/** A checklist with its items in order. */
export const CHECKLIST_SELECT = {
  id: true,
  cardId: true,
  title: true,
  position: true,
  items: { select: ITEM_SELECT, orderBy: [...ITEM_ORDER] },
} satisfies Prisma.ChecklistSelect;

export interface ChecklistItemRow {
  id: string;
  checklistId: string;
  content: string;
  isCompleted: boolean;
  position: number;
}

export interface ChecklistRow {
  id: string;
  cardId: string;
  title: string;
  position: number;
  items: ChecklistItemRow[];
}

export function toChecklistItemDto(item: ChecklistItemRow): ChecklistItemDto {
  return {
    id: item.id,
    checklistId: item.checklistId,
    content: item.content,
    isCompleted: item.isCompleted,
    position: item.position,
  };
}

export function toChecklistDto(checklist: ChecklistRow): ChecklistDto {
  return {
    id: checklist.id,
    cardId: checklist.cardId,
    title: checklist.title,
    position: checklist.position,
    items: checklist.items.map(toChecklistItemDto),
  };
}
