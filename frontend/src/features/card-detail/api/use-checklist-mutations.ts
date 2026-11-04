import {
  type ChecklistDto,
  type ChecklistItemDto,
  ErrorCode,
  positionBetween,
} from '@trello/contracts';
import { ApiError } from '../../../shared/lib/http';
import {
  findChecklist,
  findItem,
  patchChecklist,
  patchItem,
  removeChecklist,
  removeItem,
  upsertChecklist,
  moveItem,
  upsertItem,
} from '../lib/card-detail-cache';
import { checklistsApi } from './checklists-api';
import { useCardMutation } from './use-card-mutation';

/** Not optimistic: the form waits for the checklist, which needs its server id. */
export function useCreateChecklist(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: (title: string) => checklistsApi.create(cardId, { title }),
    onSuccessCard: (card, checklist: ChecklistDto) => upsertChecklist(card, checklist),
    errorMessage: 'Checklist eklenemedi. Tekrar dene.',
  });
}

export interface RenameChecklistVariables {
  checklistId: string;
  title: string;
}

export function useRenameChecklist(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: ({ checklistId, title }: RenameChecklistVariables) =>
      checklistsApi.rename(checklistId, { title }),
    optimistic: (card, { checklistId, title }) => patchChecklist(card, checklistId, { title }),
    touches: ({ checklistId }) => [`checklist:${checklistId}:title`],
    revert: (card, previous, { checklistId }) => {
      const before = findChecklist(previous, checklistId);
      return before ? patchChecklist(card, checklistId, { title: before.title }) : card;
    },
    // The answer carries all items; only the title is this request's.
    onSuccessCard: (card, answer: ChecklistDto) =>
      patchChecklist(card, answer.id, { title: answer.title }),
    errorMessage: 'Checklist adı kaydedilemedi. Tekrar dene.',
  });
}

export interface MoveChecklistVariables {
  checklistId: string;
  afterChecklistId: string | null;
  beforeChecklistId: string | null;
}

export function useMoveChecklist(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: ({ checklistId, ...anchors }: MoveChecklistVariables) =>
      checklistsApi.move(checklistId, anchors),
    optimistic: (card, { checklistId, afterChecklistId, beforeChecklistId }) => {
      const positionOf = (id: string | null) =>
        card.checklists.find((checklist) => checklist.id === id)?.position ?? null;
      const position = positionBetween(positionOf(afterChecklistId), positionOf(beforeChecklistId));
      return patchChecklist(card, checklistId, { position });
    },
    touches: ({ checklistId }) => [`checklist:${checklistId}:position`],
    revert: (card, previous, { checklistId }) => {
      const before = findChecklist(previous, checklistId);
      return before ? patchChecklist(card, checklistId, { position: before.position }) : card;
    },
    onSuccessCard: (card, { id, position }) => patchChecklist(card, id, { position }),
    errorMessage: 'Checklist taşınamadı. Tekrar dene.',
    conflictMessage: 'Checklist sırası başka biri tarafından değiştirildi. Kart yenilendi.',
  });
}

/** Not optimistic: the confirmation dialog waits for the answer. */
export function useDeleteChecklist(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: (checklistId: string) => checklistsApi.remove(checklistId),
    onSuccessCard: (card, _data, checklistId) => removeChecklist(card, checklistId),
    errorMessage: 'Checklist silinemedi. Tekrar dene.',
  });
}

export interface CreateItemVariables {
  checklistId: string;
  content: string;
}

/** Not optimistic: the composer stays open and empties its field at once. */
export function useCreateChecklistItem(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: ({ checklistId, content }: CreateItemVariables) =>
      checklistsApi.createItem(checklistId, { content }),
    onSuccessCard: (card, item: ChecklistItemDto) => upsertItem(card, item),
    errorMessage: 'Öğe eklenemedi. Tekrar dene.',
  });
}

export interface UpdateItemVariables {
  itemId: string;
  content?: string;
  isCompleted?: boolean;
}

/** Optimistic: ticking an item changes the card tile's "x/y" at once. */
export function useUpdateChecklistItem(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: ({ itemId, ...body }: UpdateItemVariables) => checklistsApi.updateItem(itemId, body),
    optimistic: (card, { itemId, ...changes }) => patchItem(card, itemId, changes),
    touches: ({ itemId, content, isCompleted }) => [
      ...(content !== undefined ? [`item:${itemId}:content`] : []),
      ...(isCompleted !== undefined ? [`item:${itemId}:isCompleted`] : []),
    ],
    revert: (card, previous, { itemId, content, isCompleted }) => {
      const before = findItem(previous, itemId);
      if (!before) return card;
      return patchItem(card, itemId, {
        ...(content !== undefined && { content: before.content }),
        ...(isCompleted !== undefined && { isCompleted: before.isCompleted }),
      });
    },
    // Only what this request changed: another tick may be on its way.
    onSuccessCard: (card, answer: ChecklistItemDto, { itemId, content, isCompleted }) =>
      patchItem(card, itemId, {
        ...(content !== undefined && { content: answer.content }),
        ...(isCompleted !== undefined && { isCompleted: answer.isCompleted }),
      }),
    errorMessage: 'Öğe kaydedilemedi. Tekrar dene.',
  });
}

export function useDeleteChecklistItem(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: (itemId: string) => checklistsApi.removeItem(itemId),
    optimistic: (card, itemId) => removeItem(card, itemId),
    touches: (itemId) => [`item:${itemId}:gone`],
    revert: (card, previous, itemId) => {
      const before = findItem(previous, itemId);
      return before ? upsertItem(card, before) : card;
    },
    errorMessage: 'Öğe silinemedi. Tekrar dene.',
  });
}

export interface MoveItemVariables {
  itemId: string;
  checklistId: string;
  afterItemId: string | null;
  beforeItemId: string | null;
}

const ITEMS_CONFLICT_MESSAGE = 'Öğeler başka biri tarafından değiştirildi. Kart yenilendi.';

/**
 * Optimistic: the item jumps to its new place, in its checklist or in another one of the
 * same card. A stale card (409, or a checklist that is gone) is refetched.
 */
export function useMoveChecklistItem(
  boardId: string,
  cardId: string,
  { onMoved, onRollback }: { onMoved?: () => void; onRollback?: () => void } = {},
) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: ({ itemId, ...body }: MoveItemVariables) => checklistsApi.moveItem(itemId, body),
    optimistic: (card, { itemId, checklistId, afterItemId, beforeItemId }) => {
      const items = card.checklists.flatMap((checklist) => checklist.items);
      const positionOf = (id: string | null) => items.find((item) => item.id === id)?.position ?? null;
      const position = positionBetween(positionOf(afterItemId), positionOf(beforeItemId));
      return moveItem(card, itemId, checklistId, position);
    },
    touches: ({ itemId }) => [`item:${itemId}:place`],
    onOptimistic: () => onMoved?.(),
    revert: (card, previous, { itemId }) => {
      const before = findItem(previous, itemId);
      return before ? moveItem(card, itemId, before.checklistId, before.position) : card;
    },
    onSuccessCard: (card, { id, checklistId, position }) => moveItem(card, id, checklistId, position),
    onRollback,
    errorMessage: (error) =>
      error instanceof ApiError && error.code === ErrorCode.INVALID_TARGET
        ? ITEMS_CONFLICT_MESSAGE
        : 'Öğe taşınamadı. Tekrar dene.',
    conflictMessage: ITEMS_CONFLICT_MESSAGE,
  });
}
