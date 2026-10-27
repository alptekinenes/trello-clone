import { describe, expect, it } from 'vitest';
import {
  MIN_POSITION_GAP,
  POSITION_GAP,
  needsRebalance,
  positionBetween,
  rebalancedPositions,
} from './position.js';

describe('positionBetween', () => {
  it('returns the gap for an empty container', () => {
    expect(positionBetween(null, null)).toBe(POSITION_GAP);
  });

  it('places an item at the top at half of the first position', () => {
    expect(positionBetween(null, 1024)).toBe(512);
  });

  it('places an item at the bottom one gap after the last position', () => {
    expect(positionBetween(2048, null)).toBe(2048 + POSITION_GAP);
  });

  it('places an item between two neighbours at the midpoint', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
  });

  it('keeps the result strictly between the neighbours', () => {
    const pos = positionBetween(1, 2);
    expect(pos).toBeGreaterThan(1);
    expect(pos).toBeLessThan(2);
  });
});

describe('needsRebalance', () => {
  it('is false for a normal gap', () => {
    expect(needsRebalance(1024, 2048, 1536)).toBe(false);
  });

  it('is false for the first item in an empty container', () => {
    expect(needsRebalance(null, null, POSITION_GAP)).toBe(false);
  });

  it('is true when the gap to the previous item is too small', () => {
    expect(needsRebalance(1, 2, 1 + MIN_POSITION_GAP / 2)).toBe(true);
  });

  it('is true when the gap to the next item is too small', () => {
    expect(needsRebalance(1, 2, 2 - MIN_POSITION_GAP / 2)).toBe(true);
  });

  it('becomes true after repeatedly inserting at the same spot', () => {
    const prev = 1024;
    let next = 2048;
    let inserts = 0;
    for (;;) {
      const pos = positionBetween(prev, next);
      inserts += 1;
      if (needsRebalance(prev, next, pos)) break;
      next = pos;
    }
    expect(inserts).toBeGreaterThan(20);
    expect(inserts).toBeLessThan(60);
  });
});

describe('rebalancedPositions', () => {
  it('spaces items one gap apart starting at the gap', () => {
    expect(rebalancedPositions(3)).toEqual([1024, 2048, 3072]);
  });

  it('returns an empty array for zero items', () => {
    expect(rebalancedPositions(0)).toEqual([]);
  });
});
