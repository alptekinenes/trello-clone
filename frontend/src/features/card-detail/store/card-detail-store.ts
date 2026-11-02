import { create } from 'zustand';

/** Sections of the card dialog that open and close in place. */
export type CardPanel = 'labels' | 'due-date' | 'checklist';

interface CardDetailState {
  /** Error of a failed change, shown inside the dialog (toasts sit behind a modal). */
  error: string | null;
  /** Text for the dialog's live region, e.g. what a drag or a move did. */
  announcement: string;
  openPanel: CardPanel | null;
  showError: (message: string) => void;
  clearError: () => void;
  announce: (message: string) => void;
  setOpenPanel: (panel: CardPanel | null) => void;
  /** Forgets everything; the dialog calls it when it goes away. */
  reset: () => void;
}

export const useCardDetailStore = create<CardDetailState>()((set) => ({
  error: null,
  announcement: '',
  openPanel: null,
  showError: (error) => set({ error }),
  clearError: () => set({ error: null }),
  announce: (announcement) => set({ announcement }),
  setOpenPanel: (openPanel) => set({ openPanel }),
  reset: () => set({ error: null, announcement: '', openPanel: null }),
}));

/** Test helper. */
export function resetCardDetailStore(): void {
  useCardDetailStore.getState().reset();
}
