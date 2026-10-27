import { describe, expect, it } from 'vitest';
import { ASSIGNABLE_BOARD_ROLES, hasBoardRole } from './boards.js';
import { isBoardBackground } from './enums.js';

describe('hasBoardRole', () => {
  it('orders roles OWNER > ADMIN > MEMBER', () => {
    expect(hasBoardRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasBoardRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasBoardRole('ADMIN', 'OWNER')).toBe(false);
    expect(hasBoardRole('MEMBER', 'MEMBER')).toBe(true);
    expect(hasBoardRole('MEMBER', 'ADMIN')).toBe(false);
  });
});

describe('ASSIGNABLE_BOARD_ROLES', () => {
  it('never includes OWNER', () => {
    expect(ASSIGNABLE_BOARD_ROLES).toEqual(['ADMIN', 'MEMBER']);
  });
});

describe('isBoardBackground', () => {
  it('accepts only known background keys', () => {
    expect(isBoardBackground('blue')).toBe(true);
    expect(isBoardBackground('grey')).toBe(true);
    expect(isBoardBackground('#ff0000')).toBe(false);
    expect(isBoardBackground('')).toBe(false);
  });
});
