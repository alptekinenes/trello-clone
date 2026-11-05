import { describe, expect, it } from 'vitest';
import type { BoardRole } from './enums.js';
import { canDeleteComment, canEditComment } from './comments.js';

describe('canEditComment', () => {
  it('allows only the author', () => {
    expect(canEditComment('a', 'a')).toBe(true);
    expect(canEditComment('a', 'b')).toBe(false);
  });
});

describe('canDeleteComment', () => {
  const roles: BoardRole[] = ['OWNER', 'ADMIN', 'MEMBER'];

  it.each(roles)('lets a %s delete their own comment', (role) => {
    expect(canDeleteComment({ userId: 'a', role }, 'a')).toBe(true);
  });

  it('lets ADMIN and OWNER delete other comments, not MEMBER', () => {
    expect(canDeleteComment({ userId: 'a', role: 'OWNER' }, 'b')).toBe(true);
    expect(canDeleteComment({ userId: 'a', role: 'ADMIN' }, 'b')).toBe(true);
    expect(canDeleteComment({ userId: 'a', role: 'MEMBER' }, 'b')).toBe(false);
  });
});
