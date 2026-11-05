import { deriveFileTokenKey, signFileToken, verifyFileToken } from './file-token.js';

const KEY = deriveFileTokenKey('a-secret-that-is-at-least-32-characters-long');
const BOARD = '6f1c3c1e-7a51-4b8a-9d55-0f3a3e1d2c4b';
const USER = '0b7d2a4e-3c61-4f0b-8a8e-5d9c1e2f3a4b';
const OTHER = '11111111-2222-4333-8444-555555555555';
const NOW = new Date('2026-11-05T12:03:20.000Z');

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
const sign = (now = NOW) => signFileToken(KEY, { boardId: BOARD, userId: USER }, now);

describe('file token', () => {
  it('round-trips the board and the user', () => {
    const { token, expiresAt } = sign();

    expect(verifyFileToken(KEY, token, NOW)).toEqual({
      boardId: BOARD,
      userId: USER,
      expiresAt,
    });
  });

  it('is valid for 5 to 10 minutes', () => {
    for (let offset = 0; offset < 900; offset += 7) {
      const now = new Date(NOW.getTime() + offset * 1000);
      const lifetime = seconds(sign(now).expiresAt) - seconds(now);
      expect(lifetime).toBeGreaterThan(299);
      expect(lifetime).toBeLessThanOrEqual(600);
    }
  });

  it('is the same string for the whole window, so URLs and caches stay stable', () => {
    const windowStart = new Date('2026-11-05T12:00:00.000Z');
    const windowEnd = new Date('2026-11-05T12:04:59.000Z');

    expect(sign(windowStart).token).toBe(sign(windowEnd).token);
    expect(sign(new Date('2026-11-05T12:05:00.000Z')).token).not.toBe(sign(windowStart).token);
  });

  it('differs per board, per user and per secret', () => {
    const base = sign().token;
    expect(signFileToken(KEY, { boardId: OTHER, userId: USER }, NOW).token).not.toBe(base);
    expect(signFileToken(KEY, { boardId: BOARD, userId: OTHER }, NOW).token).not.toBe(base);
    const otherKey = deriveFileTokenKey('another-secret-that-is-at-least-32-characters');
    expect(signFileToken(otherKey, { boardId: BOARD, userId: USER }, NOW).token).not.toBe(base);
    expect(verifyFileToken(otherKey, base, NOW)).toBeNull();
  });

  it('rejects a changed signature, board, user or expiry', () => {
    const [board, user, exp, signature] = sign().token.split('.');
    const flipped = `${signature.slice(0, -2)}${signature.endsWith('AA') ? 'BB' : 'AA'}`;
    const later = String(Number(exp) + 1);

    expect(verifyFileToken(KEY, [board, user, exp, flipped].join('.'), NOW)).toBeNull();
    expect(verifyFileToken(KEY, [OTHER, user, exp, signature].join('.'), NOW)).toBeNull();
    expect(verifyFileToken(KEY, [board, OTHER, exp, signature].join('.'), NOW)).toBeNull();
    expect(verifyFileToken(KEY, [board, user, later, signature].join('.'), NOW)).toBeNull();
  });

  it('rejects an expired key, also at the very second it expires', () => {
    const { token, expiresAt } = sign();

    expect(verifyFileToken(KEY, token, new Date(expiresAt.getTime() - 1000))).not.toBeNull();
    expect(verifyFileToken(KEY, token, expiresAt)).toBeNull();
    expect(verifyFileToken(KEY, token, new Date(expiresAt.getTime() + 3_600_000))).toBeNull();
  });

  it('rejects a key that claims to live longer than 10 minutes, even with a valid signature', () => {
    const far = sign(new Date(NOW.getTime() + 3_600_000)).token;
    expect(verifyFileToken(KEY, far, NOW)).toBeNull();
  });

  it.each([
    '',
    'abc',
    'a.b.c',
    'a.b.c.d.e',
    `${BOARD}.${USER}.abc.xyz`,
    `${BOARD}.${USER}.-5.${'A'.repeat(43)}`,
    `${BOARD}.${USER}.99999999999999999999.${'A'.repeat(43)}`,
    `not-a-uuid.${USER}.1.${'A'.repeat(43)}`,
    `${BOARD}.${USER}.${seconds(NOW) + 400}.short`,
    `${BOARD}.${USER}.${seconds(NOW) + 400}.${'A'.repeat(80)}`,
    `${BOARD}.${USER}.${seconds(NOW) + 400}.`,
  ])('rejects the malformed key %j without throwing', (token) => {
    expect(verifyFileToken(KEY, token, NOW)).toBeNull();
  });
});
