import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth-schemas';

function messages(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));
}

describe('loginSchema', () => {
  it('accepts valid input and trims the email', () => {
    const result = loginSchema.safeParse({ email: '  ayse@example.com ', password: 'x' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('ayse@example.com');
  });

  it('asks for both fields when empty', () => {
    expect(messages(loginSchema.safeParse({ email: '', password: '' }))).toEqual({
      email: 'E-posta adresini gir.',
      password: 'Parolanı gir.',
    });
  });

  it('rejects an invalid email', () => {
    expect(messages(loginSchema.safeParse({ email: 'ayse@', password: 'x' }))).toEqual({
      email: 'Geçerli bir e-posta adresi gir.',
    });
  });

  it('does not trim the password', () => {
    const result = loginSchema.safeParse({ email: 'a@example.com', password: '  pw  ' });
    expect(result.data?.password).toBe('  pw  ');
  });
});

describe('registerSchema', () => {
  const valid = { name: 'Ayşe', email: 'ayse@example.com', password: 'secret-password' };

  it('accepts valid input and trims the name', () => {
    const result = registerSchema.safeParse({ ...valid, name: '  Ayşe Yılmaz  ' });
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('Ayşe Yılmaz');
  });

  it('requires a name', () => {
    expect(messages(registerSchema.safeParse({ ...valid, name: '   ' }))).toEqual({
      name: 'Adını gir.',
    });
  });

  it('requires at least 8 password characters', () => {
    expect(messages(registerSchema.safeParse({ ...valid, password: '1234567' }))).toEqual({
      password: 'Parola en az 8 karakter olmalı.',
    });
  });

  it('limits the password to 128 characters', () => {
    expect(messages(registerSchema.safeParse({ ...valid, password: 'x'.repeat(129) }))).toEqual({
      password: 'Parola en fazla 128 karakter olabilir.',
    });
  });

  it('limits the name to 100 characters', () => {
    expect(messages(registerSchema.safeParse({ ...valid, name: 'x'.repeat(101) }))).toEqual({
      name: 'Ad en fazla 100 karakter olabilir.',
    });
  });
});
