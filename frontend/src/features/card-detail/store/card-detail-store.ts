import { create } from 'zustand';
import { showToast } from '../../../shared/store/toast-store';

/** Sections of the card dialog that open and close in place. */
export type CardPanel = 'labels' | 'due-date' | 'checklist';

interface CardDetailState {
  /** The card whose dialog is open, if any. */
  openCardId: string | null;
  /** Error of a failed change to the open card, shown inside the dialog. */
  error: { cardId: string; message: string } | null;
  /** Text for the dialog's live region, e.g. what a drag or a move did. */
  announcement: string;
  openPanel: CardPanel | null;
  /**
   * A failure of a change to `cardId`. A modal hides the toasts behind its backdrop, so it
   * is shown inside the dialog when that card's dialog is open, and as a toast otherwise
   * (the dialog was closed while the request was on its way).
   */
  showError: (cardId: string, message: string) => void;
  clearError: () => void;
  announce: (message: string) => void;
  setOpenPanel: (panel: CardPanel | null) => void;
  /** The dialog of this card opened. */
  open: (cardId: string) => void;
  /** Forgets everything; the dialog calls it when it goes away. */
  reset: () => void;
}

export const useCardDetailStore = create<CardDetailState>()((set, get) => ({
  openCardId: null,
  error: null,
  announcement: '',
  openPanel: null,
  showError: (cardId, message) => {
    if (get().openCardId === cardId) set({ error: { cardId, message } });
    else showToast(message, { tone: 'error' });
  },
  clearError: () => set({ error: null }),
  announce: (announcement) => set({ announcement }),
  setOpenPanel: (openPanel) => set({ openPanel }),
  open: (openCardId) => set({ openCardId, error: null, announcement: '', openPanel: null }),
  reset: () => set({ openCardId: null, error: null, announcement: '', openPanel: null }),
}));

/** Test helper. */
export function resetCardDetailStore(): void {
  useCardDetailStore.getState().reset();
}
