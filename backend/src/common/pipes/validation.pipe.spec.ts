import { ValidationError } from 'class-validator';
import { flattenValidationErrors } from './validation.pipe.js';

function error(
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return Object.assign(new ValidationError(), { property, constraints, children });
}

describe('flattenValidationErrors', () => {
  it('returns one entry per invalid field', () => {
    const result = flattenValidationErrors([
      error('title', { isNotEmpty: 'title should not be empty' }),
      error('email', { isEmail: 'email must be an email' }),
    ]);
    expect(result).toEqual([
      { field: 'title', errors: ['title should not be empty'] },
      { field: 'email', errors: ['email must be an email'] },
    ]);
  });

  it('uses dotted paths for nested errors', () => {
    const result = flattenValidationErrors([
      error('items', undefined, [
        error('0', undefined, [error('content', { maxLength: 'too long' })]),
      ]),
    ]);
    expect(result).toEqual([{ field: 'items.0.content', errors: ['too long'] }]);
  });
});
