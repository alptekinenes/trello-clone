import type { CardDetailDto } from '@trello/contracts';
import { useDialogClose } from '../../../shared/ui/dialog';
import { useArchiveCardWithFocus } from '../../board-detail';

/**
 * Archives the open card. The dialog closes the native way first, so the page is
 * usable again when the focus moves on to the neighbouring card; the toast offers "Geri al".
 */
export function useArchiveOpenCard(boardId: string, card: CardDetailDto) {
  const closeDialog = useDialogClose();
  const archive = useArchiveCardWithFocus(boardId);

  return function archiveOpenCard() {
    closeDialog();
    archive(card);
  };
}
