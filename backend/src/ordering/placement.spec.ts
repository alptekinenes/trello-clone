import { MIN_POSITION_GAP, POSITION_GAP } from '@trello/contracts';
import { AnchorNotFoundError, placeItem, type Sibling } from './placement.js';

const SIBLINGS: Sibling[] = [
  { id: 'a', position: 1024 },
  { id: 'b', position: 2048 },
  { id: 'c', position: 3072 },
];

describe('placeItem', () => {
  it('puts the item first in an empty container', () => {
    expect(placeItem([], {})).toEqual({ position: POSITION_GAP, rebalanced: null });
  });

  it('appends to the end without anchors', () => {
    expect(placeItem(SIBLINGS, {}).position).toBe(3072 + POSITION_GAP);
  });

  it('places after an anchor', () => {
    expect(placeItem(SIBLINGS, { afterId: 'a' }).position).toBe(1536);
    expect(placeItem(SIBLINGS, { afterId: 'c' }).position).toBe(3072 + POSITION_GAP);
  });

  it('places before an anchor', () => {
    expect(placeItem(SIBLINGS, { beforeId: 'a' }).position).toBe(512);
    expect(placeItem(SIBLINGS, { beforeId: 'c' }).position).toBe(2560);
  });

  it('lets afterId win when the anchors are no longer neighbours', () => {
    expect(placeItem(SIBLINGS, { afterId: 'a', beforeId: 'c' }).position).toBe(1536);
  });

  it('treats null anchors like missing ones', () => {
    expect(placeItem(SIBLINGS, { afterId: null, beforeId: null }).position).toBe(4096);
  });

  it('throws when an anchor is not a sibling', () => {
    expect(() => placeItem(SIBLINGS, { afterId: 'gone' })).toThrow(AnchorNotFoundError);
    expect(() => placeItem(SIBLINGS, { beforeId: 'gone' })).toThrow(AnchorNotFoundError);
  });

  it('rebalances when the gap is used up, keeping the order', () => {
    const tight: Sibling[] = [
      { id: 'a', position: 1 },
      { id: 'b', position: 1 + MIN_POSITION_GAP / 2 },
      { id: 'c', position: 5 },
    ];

    const result = placeItem(tight, { afterId: 'a' });

    expect(result.position).toBe(2 * POSITION_GAP);
    expect(result.rebalanced).toEqual([
      { id: 'a', position: POSITION_GAP },
      { id: 'b', position: 3 * POSITION_GAP },
      { id: 'c', position: 4 * POSITION_GAP },
    ]);
  });

  it('rebalances when placing before a position near zero', () => {
    const result = placeItem([{ id: 'a', position: MIN_POSITION_GAP / 4 }], { beforeId: 'a' });

    expect(result.position).toBe(POSITION_GAP);
    expect(result.rebalanced).toEqual([{ id: 'a', position: 2 * POSITION_GAP }]);
  });

  it('survives many inserts at the same spot by rebalancing', () => {
    let siblings: Sibling[] = [
      { id: 'first', position: 1024 },
      { id: 'last', position: 2048 },
    ];
    let rebalances = 0;
    for (let i = 0; i < 100; i += 1) {
      const { position, rebalanced } = placeItem(siblings, { afterId: 'first' });
      if (rebalanced) {
        rebalances += 1;
        siblings = rebalanced;
      }
      siblings = [...siblings, { id: `n${i}`, position }].sort((x, y) => x.position - y.position);
    }

    expect(rebalances).toBeGreaterThan(0);
    expect(siblings[0].id).toBe('first');
    expect(siblings.at(-1)?.id).toBe('last');
    // Newest inserts sit right after "first", in reverse insertion order.
    expect(siblings[1].id).toBe('n99');
    const positions = siblings.map((s) => s.position);
    expect(new Set(positions).size).toBe(positions.length);
  });
});
