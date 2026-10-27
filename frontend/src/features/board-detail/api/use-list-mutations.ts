import { useQuery } from '@tanstack/react-query';
import { ErrorCode, type ListDto, positionBetween } from '@trello/contracts';
import { ApiError } from '../../../shared/lib/http';
import { showToast } from '../../../shared/store/toast-store';
import { boardKeys } from '../../boards';
import { patchList, removeList, upsertList } from '../lib/board-cache';
import { listsApi } from './lists-api';
import { useBoardMutation } from './use-board-mutation';

export const archivedListsKey = (boardId: string) =>
  [...boardKeys.detail(boardId), 'archived-lists'] as const;

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCode.POSITION_CONFLICT;
}

export function useArchivedLists(boardId: string) {
  return useQuery({
    queryKey: archivedListsKey(boardId),
    queryFn: () => listsApi.archived(boardId),
  });
}

export function useCreateList(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: (title: string) => listsApi.create(boardId, { title }),
    onSuccessCache: (detail, list: ListDto) => upsertList(detail, list),
  });
}

export function useRenameList(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: ({ listId, title }: { listId: string; title: string }) =>
      listsApi.update(listId, { title }),
    optimistic: (detail, { listId, title }) => patchList(detail, listId, { title }),
    onError: () => showToast('Liste adı kaydedilemedi. Tekrar dene.', { tone: 'error' }),
  });
}

export interface MoveListVariables {
  listId: string;
  afterListId: string | null;
  beforeListId: string | null;
}

/** Optimistic: the list jumps to its new place at once; a stale order (409) reloads the board. */
export function useMoveList(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: ({ listId, afterListId, beforeListId }: MoveListVariables) =>
      listsApi.move(listId, { afterListId, beforeListId }),
    optimistic: (detail, { listId, afterListId, beforeListId }) => {
      const positionOf = (id: string | null) =>
        detail.lists.find((list) => list.id === id)?.position ?? null;
      const position = positionBetween(positionOf(afterListId), positionOf(beforeListId));
      return patchList(detail, listId, { position });
    },
    onSuccessCache: (detail, { id, position }) => patchList(detail, id, { position }),
    onError: (error) =>
      showToast(
        isConflict(error)
          ? 'Listeler bu sırada başka biri tarafından değiştirildi. Pano yenilendi.'
          : 'Liste taşınamadı. Tekrar dene.',
        { tone: 'error' },
      ),
  });
}

/** Optimistic: the list disappears at once; the toast offers to undo. */
export function useArchiveList(boardId: string) {
  const restore = useRestoreList(boardId);
  return useBoardMutation({
    boardId,
    mutationFn: (list: ListDto) => listsApi.update(list.id, { archived: true }),
    optimistic: (detail, list) => removeList(detail, list.id),
    onSuccess: (_data, list) =>
      showToast(`“${list.title}” listesi arşivlendi.`, {
        action: { label: 'Geri al', onClick: () => restore.mutate(list.id) },
      }),
    onError: () => showToast('Liste arşivlenemedi. Tekrar dene.', { tone: 'error' }),
  });
}

/** Back to the board, at the end. */
export function useRestoreList(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: (listId: string) => listsApi.update(listId, { archived: false }),
    onSuccessCache: (detail, list: ListDto) => upsertList(detail, list),
  });
}

/** Permanent; only admins. Not optimistic: the archive dialog waits for the answer. */
export function useDeleteList(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: (listId: string) => listsApi.remove(listId),
  });
}
