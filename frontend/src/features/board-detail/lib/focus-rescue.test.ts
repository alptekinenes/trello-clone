import type { BoardDetailDto } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { boardDetail, testCards, testLists } from '../../../test/fixtures';
import { focusSpot, rescueTarget } from './focus-rescue';

const [TODO, DOING] = testLists('Yapılacaklar', 'Yapılıyor');
const [CARD] = testCards(TODO.id, 'Taslak');
const detail = (overrides: Partial<BoardDetailDto> = {}): BoardDetailDto => ({
  ...boardDetail('OWNER', 'Pano', [TODO, DOING], CARD ? [CARD] : []),
  ...overrides,
});

describe('focusSpot', () => {
  function mount(html: string): Element {
    document.body.innerHTML = html;
    return document.getElementById('focused') as Element;
  }

  it('finds the card tile and the list that hold the focused element', () => {
    const active = mount(
      '<ol><li data-list-id="l1"><ol><li data-card-id="c1"><button id="focused"></button></li></ol></li></ol>',
    );

    expect(focusSpot(active)).toEqual({ listId: 'l1', cardId: 'c1' });
  });

  it('finds only the list for an element outside every card', () => {
    const active = mount('<ol><li data-list-id="l1"><button id="focused"></button></li></ol>');

    expect(focusSpot(active)).toEqual({ listId: 'l1', cardId: null });
  });

  it('is null when the focus is outside the lists', () => {
    expect(focusSpot(mount('<header><button id="focused"></button></header>'))).toBeNull();
    expect(focusSpot(null)).toBeNull();
  });
});

describe('rescueTarget', () => {
  it('is null while the card is still in its list', () => {
    expect(rescueTarget({ listId: TODO.id, cardId: CARD?.id ?? '' }, detail())).toBeNull();
  });

  it('is the add-card button of the list when the card is gone', () => {
    expect(rescueTarget({ listId: TODO.id, cardId: CARD?.id ?? '' }, detail({ cards: [] }))).toEqual({
      kind: 'add-card',
      listId: TODO.id,
    });
  });

  it('is the add-card button of the old list when the card moved to another list', () => {
    const moved = detail({ cards: CARD ? [{ ...CARD, listId: DOING.id }] : [] });

    expect(rescueTarget({ listId: TODO.id, cardId: CARD?.id ?? '' }, moved)).toEqual({
      kind: 'add-card',
      listId: TODO.id,
    });
  });

  it('is the lists region when the list is gone', () => {
    const withoutList = detail({ lists: [DOING], cards: [] });

    expect(rescueTarget({ listId: TODO.id, cardId: CARD?.id ?? '' }, withoutList)).toEqual({ kind: 'lists' });
    expect(rescueTarget({ listId: TODO.id, cardId: null }, withoutList)).toEqual({ kind: 'lists' });
  });

  it('is null for the focus on a list that is still there', () => {
    expect(rescueTarget({ listId: TODO.id, cardId: null }, detail())).toBeNull();
  });
});
