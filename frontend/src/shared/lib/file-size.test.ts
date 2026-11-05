import { describe, expect, it } from 'vitest';
import { formatFileSize } from './file-size';

describe('formatFileSize', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [1229, '1,2 KB'],
    [3.4 * 1024 * 1024, '3,4 MB'],
    [10 * 1024 * 1024, '10 MB'],
    [2 * 1024 ** 3, '2 GB'],
    [-5, '0 B'],
  ])('formats %d bytes as %s', (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });
});
