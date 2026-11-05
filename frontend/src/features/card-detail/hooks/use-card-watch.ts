import type { BoardDetailDto } from '@trello/contracts';
import { useToggleCardWatch } from '../api/use-toggle-card-watch';

/** Whether the current user watches the card (read from the board) and the switch for it. */
export function useCardWatch(board: BoardDetailDto, cardId: string) {
  const toggle = useToggleCardWatch(board.board.id);
  const watching = board.myWatchedCardIds.includes(cardId);

  return {
    watching,
    toggleWatch: () => toggle.mutate({ cardId, watching: !watching }),
  };
}
