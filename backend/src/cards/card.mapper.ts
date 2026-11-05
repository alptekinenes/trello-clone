import {
  ATTACHMENT_LIMITS,
  type CardDetailDto,
  type CardSummaryDto,
  type LabelColor,
} from '@trello/contracts';
import {
  CHECKLIST_ORDER,
  CHECKLIST_SELECT,
  type ChecklistRow,
  toChecklistDto,
} from '../checklists/checklist.mapper.js';
import {
  ATTACHMENT_SELECT,
  type AttachmentRow,
  toAttachmentDto,
} from '../attachments/attachment.mapper.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Assignment order; userId breaks ties. */
const CARD_MEMBER_ORDER: Prisma.CardMemberOrderByWithRelationInput[] = [
  { assignedAt: 'asc' },
  { userId: 'asc' },
];

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
  completedAt: true,
  coverColor: true,
  archivedAt: true,
  commentCount: true,
  attachmentCount: true,
  coverAttachmentId: true,
  labels: { select: { labelId: true }, orderBy: { assignedAt: 'asc' } },
  members: { select: { userId: true }, orderBy: CARD_MEMBER_ORDER },
  checklists: { select: { items: { select: { isCompleted: true } } } },
} as const;

/** Everything the card dialog needs: the description and full checklists on top of the summary. */
export const CARD_DETAIL_SELECT = {
  ...CARD_SELECT,
  boardId: true,
  description: true,
  checklists: { select: CHECKLIST_SELECT, orderBy: [...CHECKLIST_ORDER] },
  attachments: {
    select: ATTACHMENT_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: ATTACHMENT_LIMITS.MAX_PER_CARD,
  },
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
  completedAt: Date | null;
  coverColor: LabelColor | null;
  archivedAt: Date | null;
  commentCount: number;
  attachmentCount: number;
  coverAttachmentId: string | null;
  labels: { labelId: string }[];
  members: { userId: string }[];
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
    completedAt: card.completedAt?.toISOString() ?? null,
    coverColor: card.coverColor,
    memberIds: card.members.map((member) => member.userId),
    hasDescription,
    checklistTotal: items.length,
    checklistDone: items.filter((item) => item.isCompleted).length,
    commentCount: card.commentCount,
    attachmentCount: card.attachmentCount,
    coverAttachmentId: card.coverAttachmentId,
  };
}

export interface CardDetailRow extends Omit<CardRow, 'checklists'> {
  boardId: string;
  description: string | null;
  checklists: ChecklistRow[];
  attachments: AttachmentRow[];
}

export function toCardDetail(card: CardDetailRow): CardDetailDto {
  return {
    ...toCardSummary(card, card.description !== null),
    boardId: card.boardId,
    description: card.description,
    checklists: card.checklists.map(toChecklistDto),
    attachments: card.attachments.map(toAttachmentDto),
  };
}
