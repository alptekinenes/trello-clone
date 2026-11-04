import { AUTH_LIMITS } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { profileSchema, toUpdateMeRequest } from './profile-schema';

const valid = { name: 'Ayşe', avatarUrl: '' };

describe('profileSchema', () => {
  it('accepts a name with no avatar', () => {
    expect(profileSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(profileSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });

  it('rejects a name that is too long', () => {
    const name = 'a'.repeat(AUTH_LIMITS.NAME_MAX + 1);
    expect(profileSchema.safeParse({ ...valid, name }).success).toBe(false);
  });

  it('accepts only https avatar addresses', () => {
    expect(profileSchema.safeParse({ ...valid, avatarUrl: 'https://x.test/a.png' }).success).toBe(true);
    expect(profileSchema.safeParse({ ...valid, avatarUrl: 'http://x.test/a.png' }).success).toBe(false);
    expect(profileSchema.safeParse({ ...valid, avatarUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(profileSchema.safeParse({ ...valid, avatarUrl: 'not a url' }).success).toBe(false);
  });
});

describe('toUpdateMeRequest', () => {
  it('trims and turns an empty avatar into null', () => {
    expect(toUpdateMeRequest({ name: ' Ayşe ', avatarUrl: '  ' })).toEqual({
      name: 'Ayşe',
      avatarUrl: null,
    });
  });
});
