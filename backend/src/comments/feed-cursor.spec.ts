import { decodeFeedCursor, encodeFeedCursor } from './feed-cursor.js';

const ID = '3f2b8a54-5c1d-4a7e-9a3b-0c6f1d2e4b5a';
const AT = new Date('2026-11-05T10:15:30.123Z');

describe('feed cursor', () => {
  it('round-trips a position', () => {
    expect(decodeFeedCursor(encodeFeedCursor({ createdAt: AT, id: ID }))).toEqual({
      createdAt: AT,
      id: ID,
    });
  });

  it('is URL-safe', () => {
    expect(encodeFeedCursor({ createdAt: AT, id: ID })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  const encode = (text: string) => Buffer.from(text, 'utf8').toString('base64url');

  it.each([
    ['garbage', 'not a cursor!!'],
    ['empty', ''],
    ['no id', encode('2026-11-05T10:15:30.123Z')],
    ['no time', encode(`|${ID}`)],
    ['bad time', encode(`yesterday|${ID}`)],
    ['impossible date', encode(`2026-13-45T10:15:30.123Z|${ID}`)],
    ['bad id', encode('2026-11-05T10:15:30.123Z|42')],
    ['extra part', encode(`2026-11-05T10:15:30.123Z|${ID}|x`)],
  ])('answers null for %s', (_name, value) => {
    expect(decodeFeedCursor(value)).toBeNull();
  });
});
