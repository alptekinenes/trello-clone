import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it.each([
    ['Ayşe Yılmaz', 'AY'],
    ['  mehmet   ali  kaya ', 'MA'],
    ['ilker', 'İ'],
    ['', ''],
  ])('%j → %j', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});
