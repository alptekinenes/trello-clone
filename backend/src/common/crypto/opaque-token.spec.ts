import { createHash } from 'node:crypto';
import { hashToken, newOpaqueToken } from './opaque-token.js';

describe('newOpaqueToken', () => {
  it('returns 43 base64url characters for the default 32 bytes', () => {
    expect(newOpaqueToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('honours a custom byte length', () => {
    expect(newOpaqueToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newOpaqueToken()));
    expect(tokens.size).toBe(50);
  });
});

describe('hashToken', () => {
  it('is a deterministic 64-character hex sha256', () => {
    const hash = hashToken('some-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('some-token')).toBe(hash);
    expect(hash).toBe(createHash('sha256').update('some-token').digest('hex'));
  });

  it('differs for different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});
