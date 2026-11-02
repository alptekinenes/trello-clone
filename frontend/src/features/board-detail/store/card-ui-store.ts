import type { CardSummaryDto } from '@trello/contracts';
import { create } from 'zustand';

type CardPlace = Pick<CardSummaryDto, 'id' | 'listId' | 'position'>;

/**
 * What takes the focus next: a card once it renders in the given place (after
 * a move, or back after a failed one), or the "Kart ekle" button of a list
 * (after its last card was archived).
 */
export type FocusTarget = ({ kind: 'card' } & CardPlace) | { kind: 'add-card'; listId: string };

interface CardUiState {
  /** Card whose actions dialog is open. */
  actionsCardId: string | null;
  focusTarget: FocusTarget | null;
  openActions: (cardId: string) => void;
  closeActions: () => void;
  focusCard: (card: CardPlace) => void;
  focusAddCard: (listId: string) => void;
  clearFocus: () => void;
  /** Forgets everything; the board page calls it when it goes away. */
  reset: () => void;
}

export const useCardUiStore = create<CardUiState>()((set) => ({
  actionsCardId: null,
  focusTarget: null,
  openActions: (cardId) => set({ actionsCardId: cardId }),
  closeActions: () => set({ actionsCardId: null }),
  focusCard: ({ id, listId, position }) =>
    set({ focusTarget: { kind: 'card', id, listId, position } }),
  focusAddCard: (listId) => set({ focusTarget: { kind: 'add-card', listId } }),
  clearFocus: () => set({ focusTarget: null }),
  reset: () => set({ actionsCardId: null, focusTarget: null }),
}));

/** True when `card` is the focus target and already rendered in the target place. */
export function isFocusTarget(target: FocusTarget | null, card: CardPlace): boolean {
  return (
    target?.kind === 'card' &&
    target.id === card.id &&
    target.listId === card.listId &&
    target.position === card.position
  );
}

export function isAddCardFocusTarget(target: FocusTarget | null, listId: string): boolean {
  return target?.kind === 'add-card' && target.listId === listId;
}

/** Test helper. */
export function resetCardUi(): void {
  useCardUiStore.getState().reset();
}
