import { describe, expect, it } from 'vitest';
import { getMoveAnchors } from './get-move-anchors';

const IDS = ['a', 'b', 'c', 'd'];

describe('getMoveAnchors', () => {
  it('moves forward: lands after the item it was dropped on', () => {
    expect(getMoveAnchors(IDS, 'a', 'c')).toEqual({ afterId: 'c', beforeId: 'd', newIndex: 2 });
  });

  it('moves backward: lands before the item it was dropped on', () => {
    expect(getMoveAnchors(IDS, 'd', 'b')).toEqual({ afterId: 'a', beforeId: 'b', newIndex: 1 });
  });

  it('moves to the start and to the end', () => {
    expect(getMoveAnchors(IDS, 'c', 'a')).toEqual({ afterId: null, beforeId: 'a', newIndex: 0 });
    expect(getMoveAnchors(IDS, 'b', 'd')).toEqual({ afterId: 'd', beforeId: null, newIndex: 3 });
  });

  it('returns null when nothing moves', () => {
    expect(getMoveAnchors(IDS, 'b', 'b')).toBeNull();
    expect(getMoveAnchors(IDS, 'b', null)).toBeNull();
    expect(getMoveAnchors(IDS, 'x', 'b')).toBeNull();
    expect(getMoveAnchors(IDS, 'b', 'x')).toBeNull();
  });
});
