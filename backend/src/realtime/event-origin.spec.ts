import { UnauthorizedException } from '@nestjs/common';
import { parseSocketId, resolveEventOrigin } from './event-origin.js';

const SOCKET_ID = 'Zk3p_9-AbCdEfGhIjKlM';

describe('parseSocketId', () => {
  it('accepts a socket.io id', () => {
    expect(SOCKET_ID).toHaveLength(20);
    expect(parseSocketId(SOCKET_ID)).toBe(SOCKET_ID);
  });

  it('accepts the length limits', () => {
    expect(parseSocketId('a')).toBe('a');
    expect(parseSocketId('a'.repeat(64))).toHaveLength(64);
  });

  it.each([
    ['empty', ''],
    ['too long', 'a'.repeat(65)],
    ['space', 'a b'],
    ['slash', 'a/b'],
    ['comma, as joined duplicate headers', 'abc, def'],
    ['newline', 'abc\n'],
    ['non-ascii', 'şğ'],
  ])('rejects %s', (_label, value) => {
    expect(parseSocketId(value)).toBeNull();
  });

  it.each([
    ['an array', ['abc']],
    ['undefined', undefined],
    ['null', null],
    ['a number', 12],
  ])('rejects %s', (_label, value) => {
    expect(parseSocketId(value)).toBeNull();
  });
});

describe('resolveEventOrigin', () => {
  const user = { id: 'user-1', email: 'ayse@example.com' };

  it('takes the actor from the request and the socket from the header', () => {
    expect(resolveEventOrigin({ user, headers: { 'x-socket-id': SOCKET_ID } })).toEqual({
      actorId: 'user-1',
      socketId: SOCKET_ID,
    });
  });

  it('has no socket when the header is missing', () => {
    expect(resolveEventOrigin({ user, headers: {} }).socketId).toBeNull();
  });

  it('ignores a malformed header instead of failing', () => {
    expect(resolveEventOrigin({ user, headers: { 'x-socket-id': 'a b' } }).socketId).toBeNull();
    expect(resolveEventOrigin({ user, headers: { 'x-socket-id': ['a', 'b'] } }).socketId).toBeNull();
  });

  it('rejects a request without a user', () => {
    expect(() => resolveEventOrigin({ headers: {} })).toThrow(UnauthorizedException);
  });
});
