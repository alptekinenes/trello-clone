import { describe, expect, it } from 'vitest';
import { boardDetail, testLists } from '../../../test/fixtures';
import { patchList, removeList, sortByPosition, upsertList } from './board-cache';

const titles = (detail: { lists: { title: string }[] }) => detail.lists.map((l) => l.title);

describe('board cache helpers', () => {
  const detail = boardDetail('OWNER', 'Pano', testLists('A', 'B', 'C'));

  it('sortByPosition breaks ties by id like the server', () => {
    const sorted = sortByPosition([
      { id: 'b', position: 1 },
      { id: 'a', position: 1 },
      { id: 'c', position: 0.5 },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('patchList moves a list by its new position', () => {
    expect(titles(patchList(detail, 'list-3', { position: 1500 }))).toEqual(['A', 'C', 'B']);
  });

  it('upsertList adds or replaces in order', () => {
    const added = upsertList(detail, { ...testLists('D')[0], id: 'list-9', position: 100 });
    expect(titles(added)).toEqual(['D', 'A', 'B', 'C']);
    const replaced = upsertList(detail, { ...detail.lists[0], title: 'A2' });
    expect(titles(replaced)).toEqual(['A2', 'B', 'C']);
  });

  it('removeList drops the list and leaves the input untouched', () => {
    expect(titles(removeList(detail, 'list-2'))).toEqual(['A', 'C']);
    expect(titles(detail)).toEqual(['A', 'B', 'C']);
  });
});
