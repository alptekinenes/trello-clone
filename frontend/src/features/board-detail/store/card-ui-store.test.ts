import { beforeEach, describe, expect, it } from 'vitest';
import { resetCardUi, useCardUiStore } from './card-ui-store';

const store = () => useCardUiStore.getState();
const board = (cards: string[], lists: string[]) => ({
  hasCard: (id: string) => cards.includes(id),
  hasList: (id: string) => lists.includes(id),
});

describe('card UI store: forgetGone', () => {
  beforeEach(resetCardUi);

  it('does nothing while everything it points at is still there', () => {
    store().openActions('c1', 'l1');
    store().focusCard({ id: 'c2', listId: 'l1', position: 1 });

    expect(store().forgetGone(board(['c1', 'c2'], ['l1']))).toBe(false);
    expect(store()).toMatchObject({ actionsCardId: 'c1', actionsListId: 'l1' });
    expect(store().focusTarget).toEqual({ kind: 'card', id: 'c2', listId: 'l1', position: 1 });
  });

  it('closes the dialog of a gone card and sends the focus to its list’s add-card button', () => {
    store().openActions('c1', 'l1');

    expect(store().forgetGone(board([], ['l1']))).toBe(true);
    expect(store()).toMatchObject({
      actionsCardId: null,
      actionsListId: null,
      focusTarget: { kind: 'add-card', listId: 'l1' },
    });
  });

  it('sends the focus to the lists region when the list of the gone card is gone as well', () => {
    store().openActions('c1', 'l1');

    expect(store().forgetGone(board([], []))).toBe(true);
    expect(store()).toMatchObject({
      actionsCardId: null,
      actionsListId: null,
      focusTarget: { kind: 'lists' },
    });
  });

  it('does not invent a focus target when no dialog was open and the pending focus is gone', () => {
    store().focusAddCard('l1');

    expect(store().forgetGone(board([], []))).toBe(false);
    expect(store().focusTarget).toBeNull();
  });

  it('drops a pending focus on a gone card or list without touching the dialog', () => {
    store().openActions('c1', 'l1');
    store().focusCard({ id: 'c2', listId: 'l1', position: 1 });
    expect(store().forgetGone(board(['c1'], ['l1']))).toBe(false);
    expect(store().focusTarget).toBeNull();
    expect(store().actionsCardId).toBe('c1');

    store().focusAddCard('l1');
    store().forgetGone(board(['c1'], []));
    expect(store().focusTarget).toBeNull();
  });
});

describe('card UI store: lists focus', () => {
  beforeEach(resetCardUi);

  it('keeps a pending focus on the lists region whatever is gone', () => {
    store().focusLists();

    expect(store().forgetGone(board([], []))).toBe(false);
    expect(store().focusTarget).toEqual({ kind: 'lists' });
  });
});
