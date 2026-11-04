import { create } from 'zustand';
import { showToast } from '../../../shared/store/toast-store';

interface BoardBackgroundState {
  /** The background dialog is on screen. */
  dialogOpen: boolean;
  /** Error of a failed background change, shown inside the open dialog. */
  error: string | null;
  /**
   * A modal makes everything behind it inert, so a toast would not be read out while the
   * dialog is open: the message goes inside the dialog then, and into a toast otherwise
   * (the dialog was closed while the request was on its way).
   */
  showError: (message: string) => void;
  clearError: () => void;
  dialogOpened: () => void;
  dialogClosed: () => void;
}

export const useBoardBackgroundStore = create<BoardBackgroundState>()((set, get) => ({
  dialogOpen: false,
  error: null,
  showError: (message) => {
    if (get().dialogOpen) set({ error: message });
    else showToast(message, { tone: 'error' });
  },
  clearError: () => set({ error: null }),
  dialogOpened: () => set({ dialogOpen: true, error: null }),
  dialogClosed: () => set({ dialogOpen: false, error: null }),
}));
