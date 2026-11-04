import type { BoardBackground } from '@trello/contracts';
import { useUpdateBoard } from '../api/use-board';
import { useBoardBackgroundStore } from '../store/board-background-store';

const FAILED_MESSAGE = 'Arka plan değiştirilemedi. Tekrar dene.';

function reportFailure() {
  useBoardBackgroundStore.getState().showError(FAILED_MESSAGE);
}

/**
 * Changes the board's background. A separate mutation from the rename, so a failed
 * background never shows up as a title error. The cache change is optimistic and rolled
 * back by `useUpdateBoard` when the request fails. The failure is reported inside the
 * background dialog while it is open (a modal hides toasts), as a toast otherwise.
 * A new choice clears the previous error.
 */
export function useBoardBackground(boardId: string) {
  const updateBoard = useUpdateBoard(boardId, reportFailure);

  function changeBackground(background: BoardBackground) {
    useBoardBackgroundStore.getState().clearError();
    updateBoard.mutate({ background });
  }

  return { changeBackground };
}
