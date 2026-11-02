import { BadRequestException } from '@nestjs/common';
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
});
