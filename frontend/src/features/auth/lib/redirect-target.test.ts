import { describe, expect, it } from 'vitest';
import { authPageLink, prefillEmail, redirectTarget, safeReturnPath } from './redirect-target';

const at = (search: string, state?: unknown) => ({ search, state });
const returnUrl = (value: string) => `?returnUrl=${encodeURIComponent(value)}`;

describe('safeReturnPath', () => {
  it('keeps a same-site path with its query and hash', () => {
    expect(safeReturnPath('/boards/1?c=2#top')).toBe('/boards/1?c=2#top');
  });

  it.each([
    ['null', null],
    ['relative path', 'boards'],
    ['protocol-relative URL', '//evil.example'],
    ['backslash host', '/\\evil.example'],
    ['tab-hidden host', '/\t/evil.example'],
    ['dot segment before an empty segment', '/.//evil.example'],
    ['encoded dot segment before an empty segment', '/%2e//evil.example'],
    ['parent segment before an empty segment', '/a/..//evil.example'],
    ['absolute URL', 'https://evil.example'],
    ['javascript URL', 'javascript:alert(1)'],
    ['too long', `/${'a'.repeat(2048)}`],
  ])('refuses %s', (_, value) => {
    expect(safeReturnPath(value)).toBeNull();
  });
});

describe('redirectTarget', () => {
  it('returns the original path with its query', () => {
    const state = { from: { pathname: '/boards/1', search: '?c=2' } };
    expect(redirectTarget(at('', state))).toBe('/boards/1?c=2');
  });

  it('uses the returnUrl of the page, keeping search and hash', () => {
    expect(redirectTarget(at(returnUrl('/boards/B?c=2#top')))).toBe('/boards/B?c=2#top');
  });

  it('prefers the page the user tried to open over returnUrl', () => {
    const state = { from: { pathname: '/boards/1' } };
    expect(redirectTarget(at(returnUrl('/boards/2'), state))).toBe('/boards/1');
  });

  it.each([
    ['no state', undefined],
    ['null state', null],
    ['state without from', { other: 1 }],
    ['from without pathname', { from: {} }],
    ['relative path', { from: { pathname: 'boards' } }],
    ['protocol-relative URL', { from: { pathname: '//evil.example' } }],
    ['non-string pathname', { from: { pathname: 42 } }],
  ])('falls back to home for %s', (_, state) => {
    expect(redirectTarget(at('', state))).toBe('/');
  });

  it.each([
    ['protocol-relative', '//evil.example'],
    ['backslash', '/\\evil.example'],
    ['dot segment before an empty segment', '/.//evil.example'],
    ['absolute', 'https://evil.example'],
    ['javascript', 'javascript:alert(1)'],
    ['relative', 'boards'],
    ['too long', `/${'a'.repeat(2048)}`],
  ])('ignores a %s returnUrl', (_, value) => {
    expect(redirectTarget(at(returnUrl(value)))).toBe('/');
  });

  it('ignores a returnUrl whose encoded dot segment leads to a protocol-relative path', () => {
    expect(redirectTarget(at('?returnUrl=%2F.%2F%2Fevil.example'))).toBe('/');
  });

  it('falls back to a valid returnUrl when the state is unusable', () => {
    const state = { from: { pathname: '//evil.example' } };
    expect(redirectTarget(at(returnUrl('/boards/B'), state))).toBe('/boards/B');
  });
});

describe('authPageLink', () => {
  it('puts the path in an encoded returnUrl', () => {
    expect(authPageLink('register', '/invitations/abc')).toEqual({
      pathname: '/register',
      search: '?returnUrl=%2Finvitations%2Fabc',
    });
  });

  it('leaves out a returnUrl that is not a same-site path', () => {
    expect(authPageLink('login', '//evil.example')).toEqual({ pathname: '/login', search: '' });
  });
});

describe('prefillEmail', () => {
  it('reads the email from the router state', () => {
    expect(prefillEmail({ email: 'b@example.com' })).toBe('b@example.com');
  });

  it.each([[undefined], [null], [{}], [{ email: 42 }]])('is empty for %j', (state) => {
    expect(prefillEmail(state)).toBe('');
  });
});
