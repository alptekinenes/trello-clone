import { describe, expect, it } from 'vitest';
import { inviteSchema } from './invite-schemas';

describe('inviteSchema', () => {
  it('accepts an address with an assignable role', () => {
    expect(inviteSchema.parse({ email: ' b@example.com ', role: 'ADMIN' })).toEqual({
      email: 'b@example.com',
      role: 'ADMIN',
    });
  });

  it('refuses the owner role, which can only be held by the creator', () => {
    expect(inviteSchema.safeParse({ email: 'b@example.com', role: 'OWNER' }).success).toBe(false);
  });

  it('refuses a missing role and a bad address', () => {
    expect(inviteSchema.safeParse({ email: 'b@example.com' }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: 'b', role: 'MEMBER' }).success).toBe(false);
  });
});
