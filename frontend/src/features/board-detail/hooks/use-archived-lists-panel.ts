import type { ListDto } from '@trello/contracts';
import { useState } from 'react';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { useArchivedLists, useDeleteList, useRestoreList } from '../api/use-list-mutations';

/** Archived lists with restore and (for admins) permanent delete behind a confirmation. */
export function useArchivedListsPanel(boardId: string) {
  const archived = useArchivedLists(boardId);
  const restore = useRestoreList(boardId);
  const remove = useDeleteList(boardId);
  const [pendingDelete, setPendingDelete] = useState<ListDto | null>(null);

  function confirmDelete() {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
  }

  function cancelDelete() {
    setPendingDelete(null);
    remove.reset();
  }

  return {
    lists: archived.data,
    isLoading: archived.isPending,
    loadError: archived.error ? apiErrorMessage(archived.error) : null,
    restore: (listId: string) => restore.mutate(listId),
    isRestoring: (listId: string) => restore.isPending && restore.variables === listId,
    restoreError: restore.error ? apiErrorMessage(restore.error) : null,
    pendingDelete,
    askDelete: setPendingDelete,
    confirmDelete,
    cancelDelete,
    isDeleting: remove.isPending,
    deleteError: remove.error ? apiErrorMessage(remove.error) : null,
  };
}
