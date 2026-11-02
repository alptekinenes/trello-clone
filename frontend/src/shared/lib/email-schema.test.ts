import { AUTH_LIMITS } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { emailSchema } from './email-schema';

const messageOf = (value: string) => {
  const result = emailSchema.safeParse(value);
  return result.success ? null : result.error.issues[0]?.message;
};

describe('emailSchema', () => {
  it('trims the address', () => {
    expect(emailSchema.parse('  ayse@example.com ')).toBe('ayse@example.com');
  });

  it('asks for an address when there is none', () => {
    expect(messageOf('   ')).toBe('E-posta adresini gir.');
  });

  it('refuses something that is not an address', () => {
    expect(messageOf('ayse')).toBe('Geçerli bir e-posta adresi gir.');
    expect(messageOf('ayse@')).toBe('Geçerli bir e-posta adresi gir.');
  });

  it('refuses an address that is too long', () => {
    const tooLong = `${'a'.repeat(AUTH_LIMITS.EMAIL_MAX)}@example.com`;
    expect(messageOf(tooLong)).toBe('E-posta adresi çok uzun.');
  });
});
