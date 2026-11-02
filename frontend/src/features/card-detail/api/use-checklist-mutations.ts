import {
  type ChecklistDto,
  type ChecklistItemDto,
  ErrorCode,
  positionBetween,
} from '@trello/contracts';
import { ApiError } from '../../../shared/lib/http';
import {
  patchChecklist,
  patchItem,
  removeChecklist,
  removeItem,
  upsertChecklist,
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
    onSuccessCard: (card, { id, position }) => patchChecklist(card, id, { position }),
    errorMessage: (error) =>
      error instanceof ApiError && error.code === ErrorCode.POSITION_CONFLICT
        ? 'Checklist sırası başka biri tarafından değiştirildi. Kart yenilendi.'
        : 'Checklist taşınamadı. Tekrar dene.',
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
    errorMessage: 'Öğe silinemedi. Tekrar dene.',
  });
}
