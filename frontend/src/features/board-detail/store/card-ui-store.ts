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
  /** The list that card was in when the dialog opened. */
  actionsListId: string | null;
  /** The open card was removed by someone else, so the dialog closed by itself. */
  actionsCardVanished: boolean;
  focusTarget: FocusTarget | null;
  openActions: (cardId: string, listId: string) => void;
  closeActions: () => void;
  /** Closes the dialog of a card that is gone; the focus goes to its list's "Kart ekle". */
  closeVanishedActions: () => void;
  focusCard: (card: CardPlace) => void;
  focusAddCard: (listId: string) => void;
  clearFocus: () => void;
  /** Forgets everything; the board page calls it when it goes away. */
  reset: () => void;
}

export const useCardUiStore = create<CardUiState>()((set) => ({
  actionsCardId: null,
  actionsListId: null,
  actionsCardVanished: false,
  focusTarget: null,
  openActions: (cardId, listId) =>
    set({ actionsCardId: cardId, actionsListId: listId, actionsCardVanished: false }),
  closeActions: () => set({ actionsCardId: null, actionsListId: null }),
  closeVanishedActions: () =>
    set((state) => ({
      actionsCardId: null,
      actionsListId: null,
      actionsCardVanished: true,
      focusTarget: state.actionsListId
        ? { kind: 'add-card', listId: state.actionsListId }
        : state.focusTarget,
    })),
  focusCard: ({ id, listId, position }) =>
    set({ focusTarget: { kind: 'card', id, listId, position } }),
  focusAddCard: (listId) => set({ focusTarget: { kind: 'add-card', listId } }),
  clearFocus: () => set({ focusTarget: null }),
  reset: () =>
    set({ actionsCardId: null, actionsListId: null, actionsCardVanished: false, focusTarget: null }),
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

/** Gives a card tile the focus once it is rendered in the given place (e.g. after its dialog closed). */
export function focusCardTile(card: CardPlace): void {
  useCardUiStore.getState().focusCard(card);
}
