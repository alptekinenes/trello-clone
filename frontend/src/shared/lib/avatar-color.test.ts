import { describe, expect, it } from 'vitest';
import { AVATAR_COLOR_CLASS, avatarColorClass, avatarColorIndex } from './avatar-color';

describe('avatarColorIndex', () => {
  it('returns the same color for the same seed', () => {
    expect(avatarColorIndex('user-1')).toBe(avatarColorIndex('user-1'));
    expect(avatarColorClass('Ayşe Yılmaz')).toBe(avatarColorClass('Ayşe Yılmaz'));
  });

  it('always stays inside the palette, even for an empty seed', () => {
    for (const seed of ['', 'a', 'ğüşiöç', 'x'.repeat(500)]) {
      const index = avatarColorIndex(seed);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(AVATAR_COLOR_CLASS.length);
    }
  });

  it('spreads many ids over every palette color without heavy skew', () => {
    const counts = new Array<number>(AVATAR_COLOR_CLASS.length).fill(0);
    const total = 800;
    for (let i = 0; i < total; i += 1) {
      const index = avatarColorIndex(`cm${i.toString(36)}user${i}`);
      counts[index] = (counts[index] ?? 0) + 1;
    }
    const expected = total / AVATAR_COLOR_CLASS.length;
    for (const count of counts) {
      expect(count).toBeGreaterThan(expected * 0.5);
      expect(count).toBeLessThan(expected * 1.5);
    }
  });
});
