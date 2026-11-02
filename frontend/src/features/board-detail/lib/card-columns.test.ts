import { describe, expect, it } from 'vitest';
import type { Columns } from '../../../shared/lib/sortable-columns';
import { testCard, testLists } from '../../../test/fixtures';
import { buildColumns, placeOf, samePlace } from './card-columns';

const [todo, doing] = testLists('Yapılacaklar', 'Yapılıyor');

const COLUMNS: Columns = {
  [todo.id]: ['a', 'b', 'c'],
  [doing.id]: ['d'],
};

describe('buildColumns', () => {
  it('groups cards by list in position order and keeps empty lists', () => {
    const columns = buildColumns(
      [todo, doing, testLists('A', 'B', 'Boş')[2]],
      [
        testCard({ id: 'b', listId: todo.id, title: 'B', position: 2048 }),
        testCard({ id: 'd', listId: doing.id, title: 'D', position: 10 }),
        testCard({ id: 'a', listId: todo.id, title: 'A', position: 1024 }),
        testCard({ id: 'x', listId: 'archived-list', title: 'X', position: 1 }),
      ],
    );

    expect(columns).toEqual({ [todo.id]: ['a', 'b'], [doing.id]: ['d'], 'list-3': [] });
  });
});

describe('placeOf', () => {
  it.each([
    ['a', { index: 0, afterCardId: null, beforeCardId: 'b' }],
    ['b', { index: 1, afterCardId: 'a', beforeCardId: 'c' }],
    ['c', { index: 2, afterCardId: 'b', beforeCardId: null }],
  ])('gives the neighbours of %s', (cardId, expected) => {
    expect(placeOf(COLUMNS, cardId)).toEqual({ listId: todo.id, ...expected });
  });

  it('has no neighbours alone in a list', () => {
    expect(placeOf(COLUMNS, 'd')).toEqual({
      listId: doing.id,
      index: 0,
      afterCardId: null,
      beforeCardId: null,
    });
  });

  it('is null for an unknown card', () => {
    expect(placeOf(COLUMNS, 'missing')).toBeNull();
  });
});

describe('samePlace', () => {
  it('compares list and neighbours, not the index', () => {
    const place = { listId: todo.id, index: 1, afterCardId: 'a', beforeCardId: 'c' };
    expect(samePlace(place, { ...place, index: 5 })).toBe(true);
    expect(samePlace(place, { ...place, listId: doing.id })).toBe(false);
    expect(samePlace(place, { ...place, beforeCardId: null })).toBe(false);
  });
});
