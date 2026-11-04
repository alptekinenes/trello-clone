import type { BoardBackground } from '@trello/contracts';
import { showToast } from '../../../shared/store/toast-store';
import { useUpdateBoard } from '../api/use-board';

/**
 * Changes the board's background. A separate mutation from the rename, so a failed
 * background never shows up as a title error. The cache change is optimistic; when the
 * request fails it is rolled back (by `useUpdateBoard`) and a toast says so. The toast is
 * raised from the board header's hook, which outlives the dialog the choice was made in.
 */
export function useBoardBackground(boardId: string) {
  const updateBoard = useUpdateBoard(boardId);

  function changeBackground(background: BoardBackground) {
    updateBoard.mutate(
      { background },
      {
        onError: () =>
          showToast('Arka plan değiştirilemedi. Önceki arka plan geri yüklendi.', { tone: 'error' }),
      },
    );
  }

  return { changeBackground };
}
