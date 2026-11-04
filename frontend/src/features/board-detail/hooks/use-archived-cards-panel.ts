import type { CardSummaryDto, ListDto } from '@trello/contracts';
import { useState } from 'react';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { useArchivedCards, useDeleteCard, useRestoreCard } from '../api/use-card-mutations';
import { useArchivedLists } from '../api/use-list-mutations';

export interface CardListInfo {
  /** Null while the archived lists are still loading. */
  title: string | null;
  /** A card can only be restored once its list is back on the board. */
  archived: boolean;
}

/**
 * Archived cards with restore and permanent delete behind a confirmation.
 * `activeLists` are the board's lists; any other list of a card is archived.
 */
export function useArchivedCardsPanel(boardId: string, activeLists: ListDto[]) {
  const archived = useArchivedCards(boardId);
  // Same query as the lists section of the archive, so no extra request.
  const archivedLists = useArchivedLists(boardId);
  const restore = useRestoreCard(boardId);
  const remove = useDeleteCard(boardId);
  const [pendingDelete, setPendingDelete] = useState<CardSummaryDto | null>(null);

  function listOf(card: CardSummaryDto): CardListInfo {
    const active = activeLists.find((list) => list.id === card.listId);
    if (active) return { title: active.title, archived: false };
    const list = archivedLists.data?.find((item) => item.id === card.listId);
    return { title: list?.title ?? null, archived: true };
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
  }

  function cancelDelete() {
    setPendingDelete(null);
    remove.reset();
  }

  return {
    cards: archived.data,
    listOf,
    isLoading: archived.isPending,
    // A failed refresh keeps showing what was loaded.
    loadError: archived.error && !archived.data ? apiErrorMessage(archived.error) : null,
    reload: () => void archived.refetch(),
    isReloading: archived.isRefetching,
    restore: (cardId: string) => restore.mutate(cardId),
    isRestoring: (cardId: string) => restore.isPending && restore.variables === cardId,
    restoreError: restore.error ? apiErrorMessage(restore.error) : null,
    pendingDelete,
    askDelete: setPendingDelete,
    confirmDelete,
    cancelDelete,
    isDeleting: remove.isPending,
    deleteError: remove.error ? apiErrorMessage(remove.error) : null,
  };
}
