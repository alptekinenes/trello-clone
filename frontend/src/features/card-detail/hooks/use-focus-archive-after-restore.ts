import { useEffect, useRef } from 'react';
import { CARD_MENU_BUTTON_ID } from '../lib/focus-ids';

/**
 * Restoring takes the "Geri yükle" button, which had the focus, out of the dialog, and the
 * "Kart menüsü" button (the way to archive) appears in the dialog's top bar. Hands the focus
 * over unless it is somewhere else already (e.g. in the description), so nothing is taken
 * from a user who moved on.
 */
export function useFocusArchiveAfterRestore(archived: boolean): void {
  const wasArchived = useRef(archived);

  useEffect(() => {
    const restored = wasArchived.current && !archived;
    wasArchived.current = archived;
    if (restored && document.activeElement === document.body) {
      document.getElementById(CARD_MENU_BUTTON_ID)?.focus();
    }
  }, [archived]);
}
