import { describe, expect, it } from 'vitest';
import { testCard, testLists } from '../../../test/fixtures';
import {
  buildColumns,
  type Columns,
  dropColumns,
  findColumn,
  moveToColumn,
  placeOf,
  samePlace,
} from './card-columns';

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

describe('findColumn', () => {
  it('finds the list of a card', () => {
    expect(findColumn(COLUMNS, 'd')).toBe(doing.id);
    expect(findColumn(COLUMNS, 'missing')).toBeNull();
  });
});

describe('moveToColumn', () => {
  it('moves a card to another list at an index', () => {
    expect(moveToColumn(COLUMNS, 'b', doing.id, 0)).toEqual({
      [todo.id]: ['a', 'c'],
      [doing.id]: ['b', 'd'],
    });
  });

  it('clamps the index and moves inside the same list', () => {
    expect(moveToColumn(COLUMNS, 'a', todo.id, 99)[todo.id]).toEqual(['b', 'c', 'a']);
    expect(moveToColumn(COLUMNS, 'c', todo.id, -1)[todo.id]).toEqual(['c', 'a', 'b']);
  });

  it('leaves the columns alone for an unknown list', () => {
    expect(moveToColumn(COLUMNS, 'a', 'nope', 0)).toBe(COLUMNS);
  });

  it('does not change the original columns', () => {
    moveToColumn(COLUMNS, 'a', doing.id, 0);
    expect(COLUMNS[todo.id]).toEqual(['a', 'b', 'c']);
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

describe('dropColumns', () => {
  it('takes the index of the card it is dropped on, like arrayMove', () => {
    expect(dropColumns(COLUMNS, 'a', 'c')[todo.id]).toEqual(['b', 'c', 'a']);
    expect(dropColumns(COLUMNS, 'c', 'a')[todo.id]).toEqual(['c', 'a', 'b']);
  });

  it('keeps the dragged place when dropped on itself, on nothing or on another list', () => {
    expect(dropColumns(COLUMNS, 'a', 'a')).toBe(COLUMNS);
    expect(dropColumns(COLUMNS, 'a', null)).toBe(COLUMNS);
    expect(dropColumns(COLUMNS, 'a', 'd')).toBe(COLUMNS);
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
