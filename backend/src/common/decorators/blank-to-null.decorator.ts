import { Transform } from 'class-transformer';

/**
 * Trims string input and turns a blank string into null. Non-strings pass
 * through for the validators to reject.
 */
export const BlankToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });
