import { describe, expect, it } from 'vitest';
import { createBoardSchema } from './board-schemas';

function errorsOf(input: unknown) {
  const result = createBoardSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('createBoardSchema', () => {
  it('trims the title', () => {
    expect(createBoardSchema.parse({ title: '  Proje ', background: 'sky' })).toEqual({
      title: 'Proje',
      background: 'sky',
    });
  });

  it('requires a title', () => {
    expect(errorsOf({ title: '   ', background: 'blue' })).toEqual(['Pano adını gir.']);
  });

  it('limits the title to 100 characters', () => {
    expect(errorsOf({ title: 'x'.repeat(101), background: 'blue' })).toEqual([
      'Pano adı en fazla 100 karakter olabilir.',
    ]);
  });

  it('accepts only known backgrounds', () => {
    expect(errorsOf({ title: 'Proje', background: 'neon' })).toHaveLength(1);
  });
});
