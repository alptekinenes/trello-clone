import type { BoardDetailDto } from '@trello/contracts';
import { useEffect } from 'react';
import { useCardUiStore } from '../store/card-ui-store';
import { useDialogStatus } from './use-dialog-status';

const VANISHED_MESSAGE = 'Kart başka biri tarafından kaldırıldı.';

/**
 * Keeps the card UI state in step with the cached board: when the card of the
 * open actions dialog (or the target of a pending focus) leaves the cache, by a
 * remote delete or archive, an archived list or a refetch, the dialog closes and
 * nothing is left behind that could act on the card later. Returns the status
 * text to put in a live region; it changes once per closed dialog.
 */
export function useVanishedCardCleanup(detail: BoardDetailDto) {
  const forgetGone = useCardUiStore((state) => state.forgetGone);
  const hasPointer = useCardUiStore(
    (state) => state.actionsCardId !== null || state.focusTarget !== null,
  );
  const { status, announce } = useDialogStatus();

  useEffect(() => {
    if (!hasPointer) return;
    const cardIds = new Set(detail.cards.map((card) => card.id));
    const listIds = new Set(detail.lists.map((list) => list.id));
    const closedDialog = forgetGone({
      hasCard: (cardId) => cardIds.has(cardId),
      hasList: (listId) => listIds.has(listId),
    });
    if (closedDialog) announce(VANISHED_MESSAGE);
  }, [detail.cards, detail.lists, hasPointer, forgetGone, announce]);

  return status;
}
