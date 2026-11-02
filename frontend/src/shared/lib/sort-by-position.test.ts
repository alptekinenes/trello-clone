import { describe, expect, it } from 'vitest';
import { sortByPosition } from './sort-by-position';

describe('sortByPosition', () => {
  it('breaks ties by id like the server', () => {
    const sorted = sortByPosition([
      { id: 'b', position: 1 },
      { id: 'a', position: 1 },
      { id: 'c', position: 0.5 },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});
