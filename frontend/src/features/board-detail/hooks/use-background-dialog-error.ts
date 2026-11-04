import { useEffect } from 'react';
import { useBoardBackgroundStore } from '../store/board-background-store';

/**
 * For the background dialog: tells the store the dialog is on screen for as long as it is
 * mounted (so failures are shown inside it) and returns the error to show.
 */
export function useBackgroundDialogError(): string | null {
  const error = useBoardBackgroundStore((state) => state.error);

  useEffect(() => {
    const { dialogOpened, dialogClosed } = useBoardBackgroundStore.getState();
    dialogOpened();
    return dialogClosed;
  }, []);

  return error;
}
