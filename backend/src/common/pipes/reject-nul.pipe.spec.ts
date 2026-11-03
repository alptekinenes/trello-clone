import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import { containsNul, RejectNulPipe } from './reject-nul.pipe.js';

describe('containsNul', () => {
  it('finds U+0000 in strings, nested objects and arrays', () => {
    expect(containsNul('a\u0000b')).toBe(true);
    expect(containsNul({ title: 'ok', items: [{ content: '\u0000' }] })).toBe(true);
  });

  it('ignores clean input and non-strings', () => {
    expect(containsNul({ title: 'Kart', position: 1, done: false, note: null })).toBe(false);
    expect(containsNul(undefined)).toBe(false);
  });
});

describe('RejectNulPipe', () => {
  const pipe = new RejectNulPipe();

  it('passes clean values through unchanged', () => {
    const body = { name: 'Acil' };
    expect(pipe.transform(body)).toBe(body);
  });

  it('refuses a NUL character with 400 VALIDATION_FAILED', () => {
    const error = (() => {
      try {
        return pipe.transform({ name: 'a\u0000b' });
      } catch (caught: unknown) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });
  });

  it('refuses a NUL character in a body, a query and a route parameter', () => {
    for (const type of ['body', 'query', 'param'] as const) {
      const metadata: ArgumentMetadata = { type };
      expect(() => pipe.transform({ name: 'a\u0000b' }, metadata)).toThrow(BadRequestException);
    }
  });

  it('does not walk values that custom decorators and gateways inject (a socket is a huge object graph)', () => {
    let reads = 0;
    const injected = new Proxy({}, { ownKeys: () => (reads++, []), getOwnPropertyDescriptor: () => undefined });

    expect(pipe.transform(injected, { type: 'custom' })).toBe(injected);
    expect(reads).toBe(0);
  });
});
