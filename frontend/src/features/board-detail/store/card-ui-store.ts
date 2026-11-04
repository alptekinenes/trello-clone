import type { CardSummaryDto } from '@trello/contracts';
import { create } from 'zustand';

type CardPlace = Pick<CardSummaryDto, 'id' | 'listId' | 'position'>;

/**
 * What takes the focus next: a card once it renders in the given place (after
 * a move, or back after a failed one), or the "Kart ekle" button of a list
 * (after its last card was archived).
 */
export type FocusTarget = ({ kind: 'card' } & CardPlace) | { kind: 'add-card'; listId: string };

/** What is still on the board. */
export interface Presence {
  hasCard: (cardId: string) => boolean;
  hasList: (listId: string) => boolean;
}

interface CardUiState {
  /** Card whose actions dialog is open. */
  actionsCardId: string | null;
  /** The list that card was in when the dialog opened. */
  actionsListId: string | null;
  focusTarget: FocusTarget | null;
  openActions: (cardId: string, listId: string) => void;
  closeActions: () => void;
  /**
   * Forgets what points at a card or list that left the board: the open dialog
   * (the focus then goes to its list's "Kart ekle", if that list is still there)
   * and a pending focus. Returns true when it closed a dialog.
   */
  forgetGone: (present: Presence) => boolean;
  focusCard: (card: CardPlace) => void;
  focusAddCard: (listId: string) => void;
  clearFocus: () => void;
  /** Forgets everything; the board page calls it when it goes away. */
  reset: () => void;
}

export const useCardUiStore = create<CardUiState>()((set, get) => ({
  actionsCardId: null,
  actionsListId: null,
  focusTarget: null,
  openActions: (cardId, listId) => set({ actionsCardId: cardId, actionsListId: listId }),
  closeActions: () => set({ actionsCardId: null, actionsListId: null }),
  forgetGone: (present) => {
    const state = get();
    const dialogGone = state.actionsCardId !== null && !present.hasCard(state.actionsCardId);
    const focusGone = state.focusTarget !== null && !isPresent(state.focusTarget, present);
    if (!dialogGone && !focusGone) return false;
    const addCardList =
      dialogGone && state.actionsListId !== null && present.hasList(state.actionsListId)
        ? state.actionsListId
        : null;
    const keptFocus = focusGone ? null : state.focusTarget;
    set({
      actionsCardId: dialogGone ? null : state.actionsCardId,
      actionsListId: dialogGone ? null : state.actionsListId,
      focusTarget: addCardList ? { kind: 'add-card', listId: addCardList } : keptFocus,
    });
    return dialogGone;
  },
  focusCard: ({ id, listId, position }) =>
    set({ focusTarget: { kind: 'card', id, listId, position } }),
  focusAddCard: (listId) => set({ focusTarget: { kind: 'add-card', listId } }),
  clearFocus: () => set({ focusTarget: null }),
  reset: () => set({ actionsCardId: null, actionsListId: null, focusTarget: null }),
}));

function isPresent(target: FocusTarget, present: Presence): boolean {
  return target.kind === 'card' ? present.hasCard(target.id) : present.hasList(target.listId);
}

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
