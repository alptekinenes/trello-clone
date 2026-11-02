import { describe, expect, it } from 'vitest';
import type { BoardRole } from './enums.js';
import { canChangeMemberRole, canInviteAs, checkMemberRemoval } from './members.js';

const ROLES: readonly BoardRole[] = ['OWNER', 'ADMIN', 'MEMBER'];

describe('checkMemberRemoval', () => {
  it('lets everyone but the owner leave', () => {
    expect(checkMemberRemoval({ userId: 'a', role: 'ADMIN' }, { userId: 'a', role: 'ADMIN' })).toBe(
      'ALLOWED',
    );
    expect(
      checkMemberRemoval({ userId: 'a', role: 'MEMBER' }, { userId: 'a', role: 'MEMBER' }),
    ).toBe('ALLOWED');
    expect(checkMemberRemoval({ userId: 'a', role: 'OWNER' }, { userId: 'a', role: 'OWNER' })).toBe(
      'OWNER_CANNOT_LEAVE',
    );
  });

  // Actor role by target role, actor and target being different users.
  const others: Record<BoardRole, Record<BoardRole, 'ALLOWED' | 'FORBIDDEN'>> = {
    OWNER: { OWNER: 'FORBIDDEN', ADMIN: 'ALLOWED', MEMBER: 'ALLOWED' },
    ADMIN: { OWNER: 'FORBIDDEN', ADMIN: 'FORBIDDEN', MEMBER: 'ALLOWED' },
    MEMBER: { OWNER: 'FORBIDDEN', ADMIN: 'FORBIDDEN', MEMBER: 'FORBIDDEN' },
  };

  for (const actorRole of ROLES) {
    for (const targetRole of ROLES) {
      it(`${actorRole} removing another ${targetRole} is ${others[actorRole][targetRole]}`, () => {
        expect(
          checkMemberRemoval(
            { userId: 'actor', role: actorRole },
            { userId: 'target', role: targetRole },
          ),
        ).toBe(others[actorRole][targetRole]);
      });
    }
  }
});

describe('canChangeMemberRole', () => {
  it('lets only the owner change roles of non-owners', () => {
    expect(canChangeMemberRole('OWNER', 'ADMIN')).toBe(true);
    expect(canChangeMemberRole('OWNER', 'MEMBER')).toBe(true);
    expect(canChangeMemberRole('OWNER', 'OWNER')).toBe(false);
    expect(canChangeMemberRole('ADMIN', 'MEMBER')).toBe(false);
    expect(canChangeMemberRole('MEMBER', 'MEMBER')).toBe(false);
  });
});

describe('canInviteAs', () => {
  it('lets admins invite members but only the owner invite admins', () => {
    expect(canInviteAs('OWNER', 'ADMIN')).toBe(true);
    expect(canInviteAs('OWNER', 'MEMBER')).toBe(true);
    expect(canInviteAs('ADMIN', 'MEMBER')).toBe(true);
    expect(canInviteAs('ADMIN', 'ADMIN')).toBe(false);
    expect(canInviteAs('MEMBER', 'MEMBER')).toBe(false);
    expect(canInviteAs('MEMBER', 'ADMIN')).toBe(false);
  });
});
