import { describe, expect, it } from 'vitest';
import { redirectTarget } from './redirect-target';

describe('redirectTarget', () => {
  it('returns the original path with its query', () => {
    expect(redirectTarget({ from: { pathname: '/boards/1', search: '?c=2' } })).toBe('/boards/1?c=2');
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
    expect(redirectTarget(state)).toBe('/');
  });
});
