import { describe, expect, it } from 'vitest';
import { INVITATION_LIMITS, isInvitationToken } from './invitations.js';

describe('isInvitationToken', () => {
  it('accepts 43 base64url characters', () => {
    expect(isInvitationToken('A'.repeat(INVITATION_LIMITS.TOKEN_LENGTH))).toBe(true);
    expect(isInvitationToken(`${'aZ09-_'.repeat(7)}a`)).toBe(true);
  });

  it('rejects 42 and 44 characters', () => {
    expect(isInvitationToken('A'.repeat(42))).toBe(false);
    expect(isInvitationToken('A'.repeat(44))).toBe(false);
  });

  it('rejects standard base64 characters and padding', () => {
    expect(isInvitationToken(`${'A'.repeat(42)}+`)).toBe(false);
    expect(isInvitationToken(`${'A'.repeat(42)}/`)).toBe(false);
    expect(isInvitationToken(`${'A'.repeat(42)}=`)).toBe(false);
  });

  it('rejects empty, whitespace and newline-suffixed input', () => {
    expect(isInvitationToken('')).toBe(false);
    expect(isInvitationToken(` ${'A'.repeat(42)}`)).toBe(false);
    expect(isInvitationToken(`${'A'.repeat(43)}\n`)).toBe(false);
  });
});
