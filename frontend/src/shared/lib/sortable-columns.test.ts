import { describe, expect, it } from 'vitest';
import {
  type Columns,
  dropColumns,
  findColumn,
  moveToColumn,
  neighboursOf,
  sameNeighbours,
} from './sortable-columns';

const COLUMNS: Columns = {
  todo: ['a', 'b', 'c'],
  doing: ['d'],
};

describe('findColumn', () => {
  it('finds the container of an item', () => {
    expect(findColumn(COLUMNS, 'd')).toBe('doing');
    expect(findColumn(COLUMNS, 'missing')).toBeNull();
  });
});

describe('moveToColumn', () => {
  it('moves an item to another container at an index', () => {
    expect(moveToColumn(COLUMNS, 'b', 'doing', 0)).toEqual({
      todo: ['a', 'c'],
      doing: ['b', 'd'],
    });
  });

  it('clamps the index and moves inside the same container', () => {
    expect(moveToColumn(COLUMNS, 'a', 'todo', 99).todo).toEqual(['b', 'c', 'a']);
    expect(moveToColumn(COLUMNS, 'c', 'todo', -1).todo).toEqual(['c', 'a', 'b']);
  });

  it('leaves the columns alone for an unknown container', () => {
    expect(moveToColumn(COLUMNS, 'a', 'nope', 0)).toBe(COLUMNS);
  });

  it('does not change the original columns', () => {
    moveToColumn(COLUMNS, 'a', 'doing', 0);
    expect(COLUMNS.todo).toEqual(['a', 'b', 'c']);
  });
});

describe('neighboursOf', () => {
  it.each([
    ['a', { index: 0, afterId: null, beforeId: 'b' }],
    ['b', { index: 1, afterId: 'a', beforeId: 'c' }],
    ['c', { index: 2, afterId: 'b', beforeId: null }],
  ])('gives the neighbours of %s', (itemId, expected) => {
    expect(neighboursOf(COLUMNS, itemId)).toEqual({ containerId: 'todo', ...expected });
  });

  it('has no neighbours alone in a container', () => {
    expect(neighboursOf(COLUMNS, 'd')).toEqual({
      containerId: 'doing',
      index: 0,
      afterId: null,
      beforeId: null,
    });
  });

  it('is null for an unknown item', () => {
    expect(neighboursOf(COLUMNS, 'missing')).toBeNull();
  });
});

describe('dropColumns', () => {
  it('takes the index of the item it is dropped on, like arrayMove', () => {
    expect(dropColumns(COLUMNS, 'a', 'c').todo).toEqual(['b', 'c', 'a']);
    expect(dropColumns(COLUMNS, 'c', 'a').todo).toEqual(['c', 'a', 'b']);
  });

  it('keeps the dragged place when dropped on itself, on nothing or in another container', () => {
    expect(dropColumns(COLUMNS, 'a', 'a')).toBe(COLUMNS);
    expect(dropColumns(COLUMNS, 'a', null)).toBe(COLUMNS);
    expect(dropColumns(COLUMNS, 'a', 'd')).toBe(COLUMNS);
  });
});

describe('sameNeighbours', () => {
  it('compares container and neighbours, not the index', () => {
    const place = { containerId: 'todo', index: 1, afterId: 'a', beforeId: 'c' };
    expect(sameNeighbours(place, { ...place, index: 5 })).toBe(true);
    expect(sameNeighbours(place, { ...place, containerId: 'doing' })).toBe(false);
    expect(sameNeighbours(place, { ...place, beforeId: null })).toBe(false);
  });
});
