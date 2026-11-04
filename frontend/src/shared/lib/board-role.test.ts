import { describe, expect, it } from 'vitest';
import { ROLE_LABEL, roleInSentence } from './board-role';

describe('roleInSentence', () => {
  it.each([
    ['OWNER', 'sahip'],
    ['ADMIN', 'yönetici'],
    ['MEMBER', 'üye'],
  ] as const)('%s → %s', (role, expected) => {
    expect(roleInSentence(role)).toBe(expected);
  });

  it('leaves the label itself capitalised', () => {
    expect(ROLE_LABEL.ADMIN).toBe('Yönetici');
  });
});
